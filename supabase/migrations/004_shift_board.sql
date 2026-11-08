-- 004 — Shift board: give-ups, swaps, claims, open-shift pickups, sick call-outs
-- Run AFTER 003_shifts_and_notifications.sql. Safe to re-run.
--
-- Drivers act only through the functions below (each checks ownership, eligibility and the
-- 48-hour cutoff). Dispatch approves, denies and reassigns from the app with staff rights.

alter table shifts add column if not exists opened_at timestamptz;   -- when it became an open shift

create table if not exists shift_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('giveup', 'swap', 'pickup', 'callout', 'assign')),
  -- posted: give-up waiting for a taker · pending_partner: swap waiting for the other driver
  -- pending: waiting for dispatch · approved / denied / declined (partner said no) / cancelled
  status text not null check (status in ('posted', 'pending_partner', 'pending', 'approved', 'denied', 'declined', 'cancelled')),
  shift_id uuid not null references shifts(id) on delete cascade,
  swap_shift_id uuid references shifts(id) on delete cascade,
  requester_id uuid not null references employees(id),
  target_id uuid references employees(id),      -- swap partner
  claimant_id uuid references employees(id),    -- who takes a give-up / who is assigned
  previous_employee_id uuid references employees(id),
  note text,
  decision_note text,
  override_reason text,
  ot_warnings jsonb,
  decided_by uuid references employees(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_requests_shift on shift_requests(shift_id);
create index if not exists idx_requests_status on shift_requests(status);

drop trigger if exists trg_audit on shift_requests;
create trigger trg_audit after insert or update or delete on shift_requests
  for each row execute function audit_row();

insert into app_settings (key, value) values ('pt_first_hours', '24') on conflict (key) do nothing;

-- ─── Internal helpers (not callable from the app) ───────────────────────────

create or replace function public.setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from app_settings where key = p_key and jsonb_typeof(value) = 'number'), p_default)
$$;

create or replace function public.setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from app_settings where key = p_key and jsonb_typeof(value) = 'boolean'), p_default)
$$;

create or replace function public.today_la() returns date
language sql stable as $$ select (now() at time zone 'America/Los_Angeles')::date $$;

-- When a shift starts (Pacific). Unposted variable starts are assumed to be 5:00 am.
create or replace function public.shift_starts_at(p_shift uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select (s.date + coalesce(s.start_time, b.default_start, time '05:00')) at time zone 'America/Los_Angeles'
  from shifts s join blocks b on b.id = s.block_id where s.id = p_shift
$$;

create or replace function public.outside_cutoff(p_shift uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select shift_starts_at(p_shift) - now() >= make_interval(hours => setting_num('request_cutoff_hours', 48)::int)
$$;

-- Why p_emp can't work p_shift (null = they can). p_ignore = a shift of theirs that is being swapped away.
create or replace function public.work_problem(p_emp uuid, p_shift uuid, p_ignore uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare e employees; s shifts; b blocks;
begin
  select * into e from employees where id = p_emp;
  if not found or not e.active then return 'Not an active employee.'; end if;
  select * into s from shifts where id = p_shift;
  if not found then return 'Shift not found.'; end if;
  select * into b from blocks where id = s.block_id;
  if e.role <> s.role then return format('This is a %s shift.', s.role); end if;
  if s.role = 'driver' and b.requires_gurney_qual and not e.gurney_qualified then
    return 'Requires gurney qualification.';
  end if;
  if exists (
    select 1 from shifts o
    where o.employee_id = p_emp and o.date = s.date and o.status = 'scheduled'
      and o.id <> p_shift and o.id is distinct from p_ignore
  ) then
    return 'Already working that day.';
  end if;
  return null;
end $$;

create or replace function public.has_active_request(p_shift uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shift_requests r
    where (r.shift_id = p_shift or r.swap_shift_id = p_shift)
      and r.status in ('posted', 'pending_partner', 'pending'))
$$;

create or replace function public.shift_label(p_shift uuid) returns text
language sql stable security definer set search_path = public as $$
  select to_char(s.date, 'Dy, Mon FMDD') || ' ' || b.code || ' (' || b.name || ')'
  from shifts s join blocks b on b.id = s.block_id where s.id = p_shift
$$;

create or replace function public.notify(p_emp uuid, p_kind text, p_title text, p_body text, p_shift uuid) returns void
language sql security definer set search_path = public as $$
  insert into notifications (employee_id, kind, title, body, shift_id) values (p_emp, p_kind, p_title, p_body, p_shift)
$$;

create or replace function public.notify_staff(p_kind text, p_title text, p_body text, p_shift uuid) returns void
language sql security definer set search_path = public as $$
  insert into notifications (employee_id, kind, title, body, shift_id)
  select id, p_kind, p_title, p_body, p_shift from employees where active and role in ('dispatcher', 'admin')
$$;

-- Tell everyone who could work an open shift (part-time only, while "part-time first" is on).
create or replace function public.announce_open_shift(p_shift uuid, p_exclude uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pt_only boolean := setting_bool('pt_first_open_shifts', false);
begin
  insert into notifications (employee_id, kind, title, body, shift_id)
  select e.id, 'open_shift', 'Open shift: ' || shift_label(p_shift),
         'You can request it on the Board.', p_shift
  from employees e
  where e.active and e.role in ('driver', 'attendant') and e.id is distinct from p_exclude
    and (not pt_only or e.employment_type = 'PT')
    and work_problem(e.id, p_shift) is null;
end $$;

create or replace function public.cancel_active_requests(p_shift uuid, p_except uuid, p_note text) returns void
language sql security definer set search_path = public as $$
  update shift_requests set status = 'cancelled', decision_note = p_note, updated_at = now()
  where (shift_id = p_shift or swap_shift_id = p_shift)
    and status in ('posted', 'pending_partner', 'pending')
    and id is distinct from p_except
$$;

create or replace function public.require_me() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := my_employee_id();
begin
  if me is null then raise exception 'Sign in first.'; end if;
  return me;
end $$;

create or replace function public.require_outside_cutoff(p_shift uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not outside_cutoff(p_shift) then
    raise exception 'This shift starts within % hours. Contact dispatch directly.', setting_num('request_cutoff_hours', 48)::int;
  end if;
end $$;

-- ─── Driver actions ─────────────────────────────────────────────────────────

-- Sick call: no approval needed and no replacement required. Dispatch is told, the shift opens up.
create or replace function public.call_out_sick(p_shift uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); s shifts; rid uuid; who text;
begin
  select * into s from shifts where id = p_shift for update;
  if not found or s.employee_id is distinct from me or s.status <> 'scheduled' then
    raise exception 'You can only call out of your own scheduled shift.';
  end if;
  if s.date < today_la() then raise exception 'That shift has already passed.'; end if;
  select name into who from employees where id = me;

  perform cancel_active_requests(p_shift, null, 'Called out sick');
  update shifts set employee_id = null, status = 'open', opened_at = now() where id = p_shift;
  insert into shift_requests (type, status, shift_id, requester_id, previous_employee_id, note, decided_at)
  values ('callout', 'approved', p_shift, me, me, p_note, now()) returning id into rid;

  perform notify_staff('callout', who || ' called out sick: ' || shift_label(p_shift),
                       coalesce(nullif(p_note, ''), 'The shift is now open for pickup.'), p_shift);
  perform announce_open_shift(p_shift, me);
  return rid;
end $$;

create or replace function public.post_giveup(p_shift uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); s shifts; rid uuid;
begin
  select * into s from shifts where id = p_shift for update;
  if not found or s.employee_id is distinct from me or s.status <> 'scheduled' then
    raise exception 'You can only give up your own scheduled shift.';
  end if;
  perform require_outside_cutoff(p_shift);
  if has_active_request(p_shift) then raise exception 'This shift already has an open request.'; end if;
  insert into shift_requests (type, status, shift_id, requester_id, previous_employee_id, note)
  values ('giveup', 'posted', p_shift, me, me, p_note) returning id into rid;
  perform announce_open_shift(p_shift, me);
  return rid;
end $$;

-- Other people's shifts you could trade for (both of you must be able to work the other's shift).
create or replace function public.swap_candidates(p_shift uuid)
returns table (shift_id uuid, date date, block_id uuid, employee_id uuid, employee_name text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := require_me(); s shifts;
begin
  select * into s from shifts where id = p_shift;
  if not found or s.employee_id is distinct from me then raise exception 'Not your shift.'; end if;
  perform require_outside_cutoff(p_shift);
  return query
    select o.id, o.date, o.block_id, o.employee_id, e.name
    from shifts o join employees e on e.id = o.employee_id
    where o.status = 'scheduled' and o.employee_id <> me and o.role = s.role
      and o.date between today_la() and today_la() + 35
      and outside_cutoff(o.id)
      and not has_active_request(o.id)
      and work_problem(me, o.id, p_shift) is null
      and work_problem(o.employee_id, p_shift, o.id) is null
    order by o.date, e.name;
end $$;

create or replace function public.propose_swap(p_shift uuid, p_swap_shift uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); s shifts; o shifts; rid uuid; who text; problem text;
begin
  select * into s from shifts where id = p_shift for update;
  select * into o from shifts where id = p_swap_shift for update;
  if s.id is null or s.employee_id is distinct from me or s.status <> 'scheduled' then
    raise exception 'You can only trade your own scheduled shift.';
  end if;
  if o.id is null or o.status <> 'scheduled' or o.employee_id is null or o.employee_id = me then
    raise exception 'Pick a coworker''s scheduled shift to trade for.';
  end if;
  perform require_outside_cutoff(p_shift);
  perform require_outside_cutoff(p_swap_shift);
  if has_active_request(p_shift) or has_active_request(p_swap_shift) then
    raise exception 'One of these shifts already has an open request.';
  end if;
  problem := coalesce(work_problem(me, p_swap_shift, p_shift), work_problem(o.employee_id, p_shift, p_swap_shift));
  if problem is not null then raise exception 'This trade doesn''t work: %', problem; end if;

  insert into shift_requests (type, status, shift_id, swap_shift_id, requester_id, target_id, previous_employee_id, note)
  values ('swap', 'pending_partner', p_shift, p_swap_shift, me, o.employee_id, me, p_note) returning id into rid;
  select name into who from employees where id = me;
  perform notify(o.employee_id, 'swap_proposed', who || ' wants to trade shifts with you',
    'Their ' || shift_label(p_shift) || ' for your ' || shift_label(p_swap_shift) || '. Answer on the Board.', p_swap_shift);
  return rid;
end $$;

create or replace function public.respond_swap(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); r shift_requests; who text;
begin
  select * into r from shift_requests where id = p_request for update;
  if not found or r.type <> 'swap' or r.target_id is distinct from me or r.status <> 'pending_partner' then
    raise exception 'This trade is no longer waiting for you.';
  end if;
  select name into who from employees where id = me;
  if p_accept then
    perform require_outside_cutoff(r.shift_id);
    perform require_outside_cutoff(r.swap_shift_id);
    update shift_requests set status = 'pending', updated_at = now() where id = p_request;
    perform notify(r.requester_id, 'swap_accepted', who || ' accepted your trade', 'Now waiting for dispatch to approve.', r.shift_id);
    perform notify_staff('request_pending', 'Trade to approve: ' || shift_label(r.shift_id) || ' ↔ ' || shift_label(r.swap_shift_id), null, r.shift_id);
  else
    update shift_requests set status = 'declined', updated_at = now() where id = p_request;
    perform notify(r.requester_id, 'swap_declined', who || ' declined your trade', shift_label(r.shift_id), r.shift_id);
  end if;
end $$;

create or replace function public.claim_giveup(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); r shift_requests; who text; problem text;
begin
  select * into r from shift_requests where id = p_request for update;
  if not found or r.type <> 'giveup' or r.status <> 'posted' then
    raise exception 'This shift is no longer available.';
  end if;
  if r.requester_id = me then raise exception 'That''s your own shift.'; end if;
  perform require_outside_cutoff(r.shift_id);
  problem := work_problem(me, r.shift_id);
  if problem is not null then raise exception '%', problem; end if;
  update shift_requests set status = 'pending', claimant_id = me, updated_at = now() where id = p_request;
  select name into who from employees where id = me;
  perform notify(r.requester_id, 'shift_claimed', who || ' wants to take your ' || shift_label(r.shift_id), 'Waiting for dispatch to approve.', r.shift_id);
  perform notify_staff('request_pending', 'Give-up to approve: ' || who || ' → ' || shift_label(r.shift_id), null, r.shift_id);
end $$;

-- Ask for an open shift. No 48-hour cutoff here: open shifts are often same-week fill-ins.
create or replace function public.request_open_shift(p_shift uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); s shifts; e employees; rid uuid; problem text;
begin
  select * into s from shifts where id = p_shift;
  if not found or s.status <> 'open' or s.employee_id is not null then raise exception 'This shift is no longer open.'; end if;
  if s.date < today_la() then raise exception 'That shift has already passed.'; end if;
  select * into e from employees where id = me;
  if setting_bool('pt_first_open_shifts', false) and e.employment_type = 'FT'
     and coalesce(s.opened_at, s.created_at) + make_interval(hours => setting_num('pt_first_hours', 24)::int) > now() then
    raise exception 'Part-time employees get first pick on open shifts. Try again later.';
  end if;
  problem := work_problem(me, p_shift);
  if problem is not null then raise exception '%', problem; end if;
  if exists (select 1 from shift_requests where shift_id = p_shift and requester_id = me and type = 'pickup' and status = 'pending') then
    raise exception 'You already asked for this shift.';
  end if;
  insert into shift_requests (type, status, shift_id, requester_id, note)
  values ('pickup', 'pending', p_shift, me, p_note) returning id into rid;
  perform notify_staff('request_pending', e.name || ' wants open shift ' || shift_label(p_shift), p_note, p_shift);
  return rid;
end $$;

create or replace function public.cancel_my_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); r shift_requests;
begin
  select * into r from shift_requests where id = p_request for update;
  if not found or r.status not in ('posted', 'pending_partner', 'pending') then
    raise exception 'This request is already closed.';
  end if;
  if r.requester_id = me then
    update shift_requests set status = 'cancelled', updated_at = now() where id = p_request;
    if r.claimant_id is not null then
      perform notify(r.claimant_id, 'request_cancelled', 'Give-up withdrawn: ' || shift_label(r.shift_id), null, r.shift_id);
    end if;
    if r.target_id is not null then
      perform notify(r.target_id, 'request_cancelled', 'Trade withdrawn: ' || shift_label(r.shift_id), null, r.shift_id);
    end if;
  elsif r.claimant_id = me and r.status = 'pending' then
    -- Taking back a claim puts the give-up back on the board.
    update shift_requests set status = 'posted', claimant_id = null, updated_at = now() where id = p_request;
  else
    raise exception 'This isn''t your request.';
  end if;
end $$;

-- ─── Permissions on the functions ───────────────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'setting_num(text, numeric)', 'setting_bool(text, boolean)', 'shift_starts_at(uuid)', 'outside_cutoff(uuid)',
    'work_problem(uuid, uuid, uuid)', 'has_active_request(uuid)', 'shift_label(uuid)',
    'notify(uuid, text, text, text, uuid)', 'notify_staff(text, text, text, uuid)', 'announce_open_shift(uuid, uuid)',
    'cancel_active_requests(uuid, uuid, text)', 'require_me()', 'require_outside_cutoff(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'call_out_sick(uuid, text)', 'post_giveup(uuid, text)', 'swap_candidates(uuid)', 'propose_swap(uuid, uuid, text)',
    'respond_swap(uuid, boolean)', 'claim_giveup(uuid)', 'request_open_shift(uuid, text)', 'cancel_my_request(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table shift_requests enable row level security;

-- Shifts posted on the board, or part of a request you're in, are visible to you.
create or replace function public.shift_on_my_board(p_shift uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shift_requests r
    where (r.shift_id = p_shift or r.swap_shift_id = p_shift)
      and ((r.type = 'giveup' and r.status = 'posted')
           or my_employee_id() in (r.requester_id, r.target_id, r.claimant_id)))
$$;
grant execute on function public.shift_on_my_board(uuid) to authenticated;

drop policy if exists shifts_read on shifts;
create policy shifts_read on shifts for select to authenticated
  using (
    employee_id = my_employee_id() or is_staff()
    or (status = 'open' and my_employee_id() is not null)
    or shift_on_my_board(id)
  );

drop policy if exists requests_read on shift_requests;
create policy requests_read on shift_requests for select to authenticated
  using (
    is_staff()
    or my_employee_id() in (requester_id, target_id, claimant_id)
    or (type = 'giveup' and status = 'posted' and my_employee_id() is not null)
  );
-- Drivers change requests only through the functions above; dispatch writes directly.
drop policy if exists requests_staff_write on shift_requests;
create policy requests_staff_write on shift_requests for all to authenticated
  using (is_staff()) with check (is_staff());

do $$ begin
  alter publication supabase_realtime add table shift_requests;
exception when duplicate_object then null; end $$;
