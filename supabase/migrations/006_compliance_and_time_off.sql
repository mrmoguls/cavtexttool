-- 006 — Expiration tracking (synced from the sheet's Due Dates tab) + time-off requests
-- Run AFTER 005_bidding_and_sheet_sync.sql. Safe to re-run.

-- ─── Compliance requirements and due dates (from the Google Sheet) ──────────

-- Requirements tab: what each item is and how to renew it.
create table if not exists compliance_requirements (
  name text primary key,
  applies_to text,
  frequency_months integer,
  first_due_days integer,
  how_to text,
  basis text,
  synced_at timestamptz not null default now()
);

-- Due Dates tab: one row per person per requirement.
create table if not exists compliance_items (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  requirement text not null,
  last_completed date,
  expiration_date date,
  frequency_months integer,
  next_due date,
  sheet_status text,          -- the sheet's own Status column (OK / Overdue / Done …)
  owner text,
  notes text,
  synced_at timestamptz not null default now(),
  -- Alerts already sent for the current due date: '60' | '30' | '7' | 'overdue'
  last_alert_level text,
  last_alerted_at timestamptz,
  -- The driver tapped "I renewed it"
  renewal_reported_at timestamptz,
  renewal_note text,
  unique (employee_id, requirement)
);
create index if not exists idx_compliance_due on compliance_items(next_due);

insert into app_settings (key, value) values ('time_off_notice_days', '14') on conflict (key) do nothing;

-- ─── Time off ───────────────────────────────────────────────────────────────

create table if not exists time_off_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  kind text not null default 'personal' check (kind in ('vacation', 'personal', 'medical', 'other')),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  short_notice boolean not null default false,
  shifts_released integer,
  decided_by uuid references employees(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_off_dates_chk check (end_date >= start_date)
);
create index if not exists idx_time_off_emp on time_off_requests(employee_id, start_date);

do $$
declare t text;
begin
  foreach t in array array['compliance_items', 'time_off_requests'] loop
    execute format('drop trigger if exists trg_audit on %I', t);
    execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function audit_row()', t);
  end loop;
end $$;

-- ─── Shift board: tell people when their request is closed by a change ──────
-- (replaces the 004 version, which closed requests silently)

create or replace function public.cancel_active_requests(p_shift uuid, p_except uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r shift_requests; waiting uuid;
begin
  for r in select * from shift_requests
    where (shift_id = p_shift or swap_shift_id = p_shift)
      and status in ('posted', 'pending_partner', 'pending')
      and id is distinct from p_except
  loop
    update shift_requests set status = 'cancelled', decision_note = p_note, updated_at = now() where id = r.id;
    waiting := case r.type when 'pickup' then r.requester_id when 'giveup' then r.claimant_id when 'swap' then r.target_id end;
    if waiting is not null then
      perform notify(waiting, 'request_cancelled', 'Request closed: ' || shift_label(p_shift),
                     p_note || '. Check the Board for other open shifts.', p_shift);
    end if;
  end loop;
end $$;
revoke all on function public.cancel_active_requests(uuid, uuid, text) from public, anon, authenticated;

-- ─── Driver actions ─────────────────────────────────────────────────────────

create or replace function public.report_renewal(p_item uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); it compliance_items; who text;
begin
  select * into it from compliance_items where id = p_item;
  if not found or it.employee_id <> me then raise exception 'Not your item.'; end if;
  update compliance_items set renewal_reported_at = now(), renewal_note = p_note where id = p_item;
  select name into who from employees where id = me;
  perform notify_staff('renewal_reported', who || ' renewed: ' || it.requirement,
    coalesce(nullif(p_note, ''), 'Update the Due Dates tab, then sync.'), null);
end $$;

create or replace function public.request_time_off(p_start date, p_end date, p_kind text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); rid uuid; who text; short boolean; n int;
begin
  if p_end < p_start then raise exception 'The last day is before the first day.'; end if;
  if p_start < today_la() then raise exception 'Time off can''t start in the past.'; end if;
  if p_end - p_start > 60 then raise exception 'For more than 60 days off, talk to the office.'; end if;
  if exists (select 1 from time_off_requests where employee_id = me and status in ('pending', 'approved')
             and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')) then
    raise exception 'You already have time off requested for some of those days.';
  end if;
  short := p_start - today_la() < setting_num('time_off_notice_days', 14)::int;
  insert into time_off_requests (employee_id, start_date, end_date, kind, note, short_notice)
  values (me, p_start, p_end, coalesce(p_kind, 'personal'), p_note, short) returning id into rid;
  select name into who from employees where id = me;
  select count(*) into n from shifts where employee_id = me and status = 'scheduled' and date between p_start and p_end;
  perform notify_staff('time_off_requested',
    who || ' requested time off: ' || to_char(p_start, 'Mon FMDD') || case when p_end > p_start then ' – ' || to_char(p_end, 'Mon FMDD') else '' end,
    n || ' scheduled shift' || case when n = 1 then '' else 's' end || ' affected' || case when short then ' · short notice' else '' end, null);
  return rid;
end $$;

create or replace function public.cancel_time_off(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); r time_off_requests;
begin
  select * into r from time_off_requests where id = p_request;
  if not found or r.employee_id <> me then raise exception 'Not your request.'; end if;
  if r.status <> 'pending' then raise exception 'Only a pending request can be cancelled. For approved time off, contact dispatch.'; end if;
  update time_off_requests set status = 'cancelled', updated_at = now() where id = p_request;
end $$;

-- ─── Daily alerts (schedule with pg_cron; admins can also run it from the app) ─

-- Expirations: each person hears about their own items at 60 / 30 / 7 days and weekly once overdue.
-- Admins get one summary. Also warns dispatch about open shifts starting within 24 hours.
create or replace function public.run_daily_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare it record; lvl text; sent int := 0; overdue int := 0; soon int := 0; open_soon int;
begin
  for it in
    select c.*, (c.next_due - today_la()) as days, e.active
    from compliance_items c join employees e on e.id = c.employee_id
    where c.next_due is not null and e.active
  loop
    lvl := case when it.days < 0 then 'overdue' when it.days <= 7 then '7' when it.days <= 30 then '30' when it.days <= 60 then '60' end;
    continue when lvl is null;
    continue when it.last_alert_level = lvl and (lvl <> 'overdue' or it.last_alerted_at > now() - interval '7 days');
    perform notify(it.employee_id, 'expiration',
      case when it.days < 0 then it.requirement || ' is overdue'
           else it.requirement || ' is due in ' || it.days || ' day' || case when it.days = 1 then '' else 's' end end,
      'Due ' || to_char(it.next_due, 'Mon FMDD, YYYY') || '. See Certifications in the app for how to renew.', null);
    update compliance_items set last_alert_level = lvl, last_alerted_at = now() where id = it.id;
    sent := sent + 1;
    if lvl = 'overdue' then overdue := overdue + 1; else soon := soon + 1; end if;
  end loop;
  if sent > 0 then
    perform notify_staff('expiration_summary', 'Certifications: ' || overdue || ' overdue, ' || soon || ' coming due',
      'Admin → Certifications has the full list.', null);
  end if;

  select count(*) into open_soon from shifts s
  where s.status = 'open' and s.employee_id is null
    and shift_starts_at(s.id) between now() and now() + interval '24 hours';
  if open_soon > 0 then
    perform notify_staff('open_shift_unfilled', open_soon || ' open shift' || case when open_soon = 1 then '' else 's' end || ' starting in the next 24 hours',
      'Nobody has picked ' || case when open_soon = 1 then 'it' else 'them' end || ' up. Assign from Requests → Open shifts.', null);
  end if;
  return sent;
end $$;

-- Admins can send alerts on demand from the app.
create or replace function public.run_daily_alerts_now() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can send alerts.'; end if;
  return run_daily_alerts();
end $$;

do $$
declare f text;
begin
  revoke all on function public.run_daily_alerts() from public, anon, authenticated;
  revoke all on function public.run_daily_alerts_now() from public, anon;
  grant execute on function public.run_daily_alerts_now() to authenticated;
  foreach f in array array['report_renewal(uuid, text)', 'request_time_off(date, date, text, text)', 'cancel_time_off(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table compliance_requirements enable row level security;
alter table compliance_items enable row level security;
alter table time_off_requests enable row level security;

drop policy if exists compliance_requirements_read on compliance_requirements;
create policy compliance_requirements_read on compliance_requirements for select to authenticated using (my_employee_id() is not null);
drop policy if exists compliance_requirements_admin on compliance_requirements;
create policy compliance_requirements_admin on compliance_requirements for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists compliance_items_read on compliance_items;
create policy compliance_items_read on compliance_items for select to authenticated using (employee_id = my_employee_id() or is_staff());
drop policy if exists compliance_items_admin on compliance_items;
create policy compliance_items_admin on compliance_items for all to authenticated using (is_admin()) with check (is_admin());

-- Time off: your own or staff; drivers act through the functions above, staff decide.
drop policy if exists time_off_read on time_off_requests;
create policy time_off_read on time_off_requests for select to authenticated using (employee_id = my_employee_id() or is_staff());
drop policy if exists time_off_staff on time_off_requests;
create policy time_off_staff on time_off_requests for all to authenticated using (is_staff()) with check (is_staff());

do $$
declare t text;
begin
  foreach t in array array['compliance_requirements', 'compliance_items', 'time_off_requests'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
