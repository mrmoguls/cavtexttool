-- 005 — Line bidding + Google Sheet sync for seniority and availability
-- Run AFTER 004_shift_board.sql. Safe to re-run.
--
-- The "Master Contact and Schedule" Google Sheet is the source of truth for seniority (Roster tab
-- start dates), role / FT-PT / active status, phone, and day-by-day availability (Schedule tab).
-- An admin syncs it from Admin → Employees; synced fields are then read-only in the app.
--
-- Flow: admin creates a period (draft) and picks its lines → opens bidding (employees rank
-- lines until the deadline) → closes and runs the seniority assignment (results) → reviews /
-- adjusts → publishes (line assignments + shifts for the period).

-- ─── Employee fields for the sheet sync ─────────────────────────────────────

alter table employees
  add column if not exists can_dispatch boolean not null default false,   -- e.g. "FT Driver, dispatch"
  add column if not exists bids_on_lines boolean not null default true,   -- false for backup drivers
  add column if not exists sheet_managed boolean not null default false,
  add column if not exists sheet_synced_at timestamptz;

-- Availability lives with the phone number (only the person and staff can read it).
-- availability: {"0": 1, "1": 0.5, ...} by day of week (0 = Sunday); 1 = available, 0.5 = partial,
-- 0 = not available. null = no availability on file (no restriction).
alter table employee_contacts
  add column if not exists availability jsonb,
  add column if not exists availability_notes text;

-- Drivers who also dispatch get dispatch rights.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('dispatcher', 'admin') or can_dispatch
                   from employees where auth_user_id = auth.uid() and active), false)
$$;

create table if not exists bid_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'quarter' check (kind in ('quarter', 'month', 'offer')),
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'published', 'cancelled')),
  closes_at timestamptz not null,           -- bidding deadline
  opened_at timestamptz,
  closed_at timestamptz,
  published_at timestamptz,
  reminder_sent_at timestamptz,
  notes text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  constraint bid_periods_dates_chk check (end_date >= start_date)
);

create table if not exists bid_period_lines (
  id uuid primary key default gen_random_uuid(),
  bid_period_id uuid not null references bid_periods(id) on delete cascade,
  line_id uuid not null references lines(id) on delete restrict,
  unique (bid_period_id, line_id)
);

create table if not exists bid_optins (
  id uuid primary key default gen_random_uuid(),
  bid_period_id uuid not null references bid_periods(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  wants_full_time boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (bid_period_id, employee_id)
);

create table if not exists bids (
  id uuid primary key default gen_random_uuid(),
  bid_period_id uuid not null references bid_periods(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  line_id uuid not null references lines(id) on delete cascade,
  rank integer not null check (rank >= 1),
  created_at timestamptz not null default now(),
  unique (bid_period_id, employee_id, line_id),
  unique (bid_period_id, employee_id, rank)
);
create index if not exists idx_bids_period on bids(bid_period_id);

-- The assignment result for each bidder (auto from seniority, or adjusted by the admin).
create table if not exists bid_results (
  id uuid primary key default gen_random_uuid(),
  bid_period_id uuid not null references bid_periods(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  line_id uuid references lines(id) on delete set null,   -- null = no line this period
  source text not null default 'auto' check (source in ('auto', 'manual')),
  rank_got integer,
  seniority_order integer,
  note text,
  created_at timestamptz not null default now(),
  unique (bid_period_id, employee_id)
);

do $$ begin
  alter table line_assignments add constraint line_assignments_bid_period_fk
    foreign key (bid_period_id) references bid_periods(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Audit: who ranked what, when, and every result change.
do $$
declare t text;
begin
  foreach t in array array['bid_periods', 'bid_period_lines', 'bid_optins', 'bids', 'bid_results'] loop
    execute format('drop trigger if exists trg_audit on %I', t);
    execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function audit_row()', t);
  end loop;
end $$;

-- ─── Eligibility (mirrors src/lib/scheduling/eligibility.ts) ────────────────

create or replace function public.line_problem(p_emp uuid, p_line uuid, p_wants_ft boolean) returns text
language plpgsql stable security definer set search_path = public as $$
declare e employees; l lines; av text;
begin
  select * into e from employees where id = p_emp;
  if not found or not e.active then return 'Not an active employee.'; end if;
  select * into l from lines where id = p_line;
  if not found or not l.active then return 'Line is not available.'; end if;
  if l.role = 'attendant' and e.role <> 'attendant' then return 'Attendant line — attendants only.'; end if;
  if l.role = 'driver' and e.role <> 'driver' then return 'Driver line — drivers only.'; end if;
  if l.requires_gurney_qual and not e.gurney_qualified then return 'Requires gurney qualification.'; end if;
  if l.employment_type = 'FT' and e.employment_type = 'PT' and not p_wants_ft then
    return 'Full-time line — turn on "I want full-time" to rank it.';
  end if;
  if l.employment_type = 'PT' and e.employment_type = 'FT' then
    return 'Part-time line — full-time employees bid on full-time lines.';
  end if;
  if not e.bids_on_lines then return 'Backup drivers pick up open shifts instead of bidding on lines.'; end if;
  -- Availability from the schedule sheet: a line can't need you on a day you're unavailable.
  select string_agg(trim(to_char(date '2026-01-04' + d.dow, 'Day')), ', ' order by d.dow) into av
  from line_days d join employee_contacts c on c.employee_id = p_emp
  where d.line_id = p_line and c.availability is not null
    and coalesce((c.availability ->> d.dow::text)::numeric, 0) = 0;
  if av is not null then return 'Not available ' || av || ' (schedule sheet).'; end if;
  return null;
end $$;

-- ─── Employees submit their ranking ─────────────────────────────────────────

-- Replaces your whole ranking for the period (first line in the array = rank 1).
create or replace function public.submit_bids(p_period uuid, p_lines uuid[], p_wants_full_time boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); bp bid_periods; i int; problem text;
begin
  select * into bp from bid_periods where id = p_period;
  if not found or bp.status <> 'open' then raise exception 'Bidding is not open for this period.'; end if;
  if now() > bp.closes_at then raise exception 'The bidding deadline has passed.'; end if;
  if (select count(distinct x) from unnest(coalesce(p_lines, '{}')) x) <> coalesce(array_length(p_lines, 1), 0) then
    raise exception 'Each line can be ranked only once.';
  end if;
  for i in 1 .. coalesce(array_length(p_lines, 1), 0) loop
    if not exists (select 1 from bid_period_lines where bid_period_id = p_period and line_id = p_lines[i]) then
      raise exception 'A ranked line is not part of this bid.';
    end if;
    problem := line_problem(me, p_lines[i], p_wants_full_time);
    if problem is not null then raise exception '%', problem; end if;
  end loop;

  delete from bids where bid_period_id = p_period and employee_id = me;
  insert into bids (bid_period_id, employee_id, line_id, rank)
  select p_period, me, p_lines[g.k], g.k from generate_subscripts(coalesce(p_lines, '{}'), 1) as g(k);
  insert into bid_optins (bid_period_id, employee_id, wants_full_time, submitted_at)
  values (p_period, me, p_wants_full_time, now())
  on conflict (bid_period_id, employee_id) do update set wants_full_time = excluded.wants_full_time, submitted_at = now();
end $$;

-- "Closing soon" reminder for people who haven't ranked yet. Schedule hourly with pg_cron
-- (see SETUP.md); the admin can also send it from the app.
create or replace function public.notify_bids_closing_soon() returns integer
language plpgsql security definer set search_path = public as $$
declare bp bid_periods; n int := 0; c int;
begin
  for bp in select * from bid_periods
    where status = 'open' and reminder_sent_at is null and closes_at between now() and now() + interval '24 hours'
  loop
    insert into notifications (employee_id, kind, title, body)
    select e.id, 'bid_closing', 'Bidding closes soon: ' || bp.name,
           'Rank your lines by ' || to_char(bp.closes_at at time zone 'America/Los_Angeles', 'Dy Mon FMDD, FMHH12:MI am') || '.'
    from employees e
    where e.active and e.role in ('driver', 'attendant') and e.bids_on_lines
      and not exists (select 1 from bid_optins o where o.bid_period_id = bp.id and o.employee_id = e.id);
    get diagnostics c = row_count;
    n := n + c;
    update bid_periods set reminder_sent_at = now() where id = bp.id;
  end loop;
  return n;
end $$;

revoke all on function public.line_problem(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.notify_bids_closing_soon() from public, anon, authenticated;
revoke all on function public.submit_bids(uuid, uuid[], boolean) from public, anon;
grant execute on function public.submit_bids(uuid, uuid[], boolean) to authenticated;

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table bid_periods enable row level security;
alter table bid_period_lines enable row level security;
alter table bid_optins enable row level security;
alter table bids enable row level security;
alter table bid_results enable row level security;

-- Periods and their lines: everyone signed in sees non-draft periods; admins see and edit all.
drop policy if exists bid_periods_read on bid_periods;
create policy bid_periods_read on bid_periods for select to authenticated
  using (is_admin() or (my_employee_id() is not null and status <> 'draft'));
drop policy if exists bid_periods_admin on bid_periods;
create policy bid_periods_admin on bid_periods for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists bid_period_lines_read on bid_period_lines;
create policy bid_period_lines_read on bid_period_lines for select to authenticated
  using (is_admin() or exists (select 1 from bid_periods p where p.id = bid_period_id and p.status <> 'draft' and my_employee_id() is not null));
drop policy if exists bid_period_lines_admin on bid_period_lines;
create policy bid_period_lines_admin on bid_period_lines for all to authenticated using (is_admin()) with check (is_admin());

-- Rankings: your own, or staff. Employees change theirs only through submit_bids.
do $$
declare t text;
begin
  foreach t in array array['bids', 'bid_optins'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (employee_id = my_employee_id() or is_staff())', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admin', t);
  end loop;
end $$;

-- Results: staff always; you see your own once the period is published.
drop policy if exists bid_results_read on bid_results;
create policy bid_results_read on bid_results for select to authenticated
  using (is_staff() or (employee_id = my_employee_id()
    and exists (select 1 from bid_periods p where p.id = bid_period_id and p.status = 'published')));
drop policy if exists bid_results_admin on bid_results;
create policy bid_results_admin on bid_results for all to authenticated using (is_admin()) with check (is_admin());

do $$
declare t text;
begin
  foreach t in array array['bid_periods', 'bid_period_lines', 'bid_optins', 'bids', 'bid_results'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
