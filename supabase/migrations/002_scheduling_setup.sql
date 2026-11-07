-- 002 — Scheduling setup: blocks, lines, coverage, line assignments, settings, audit log
-- Run AFTER 001_employees_and_auth.sql. Safe to re-run (seed rows are only inserted if missing).
--
-- Day-of-week numbers everywhere: 0 = Sunday … 6 = Saturday (payroll week runs Sun–Sat).

-- ─── Blocks: a type of daily shift (AM, MID, PM …) ──────────────────────────

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  crew_roles text[] not null default '{driver}',
  start_type text not null check (start_type in ('fixed', 'variable')),
  end_type text not null check (end_type in ('fixed', 'variable')),
  default_start time,
  default_end time,
  target_paid_hours numeric(4,2) not null check (target_paid_hours > 0 and target_paid_hours <= 16),
  -- applies to the DRIVER position on this block
  requires_gurney_qual boolean not null default false,
  start_rule_note text,   -- variable start, e.g. "30 minutes before your first scheduled pickup"
  end_rule_note text,     -- variable end,   e.g. "last scheduled drop-off"
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint blocks_crew_roles_chk check (crew_roles <@ array['driver', 'attendant'] and cardinality(crew_roles) > 0),
  constraint blocks_fixed_start_chk check (start_type = 'variable' or default_start is not null),
  constraint blocks_fixed_end_chk check (end_type = 'variable' or default_end is not null)
);

-- ─── Lines: a recurring weekly pattern of blocks that people bid on ─────────

create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default '',
  employment_type text not null check (employment_type in ('FT', 'PT')),
  category text not null default 'core' check (category in ('core', 'growth')),
  role text not null check (role in ('driver', 'attendant')),
  requires_gurney_qual boolean not null default false,
  is_flex boolean not null default false,        -- no fixed blocks; on-call + fill-ins
  positions integer not null default 1 check (positions >= 1),
  active boolean not null default true,
  notes text,
  sort_order integer not null default 0,
  converted_to_core_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists line_days (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references lines(id) on delete cascade,
  dow smallint not null check (dow between 0 and 6),
  block_id uuid not null references blocks(id) on delete restrict,
  unique (line_id, dow)
);
create index if not exists idx_line_days_block on line_days(block_id);

-- A line's role must be one of its blocks' crew roles (no attendant on a driver-only block).
create or replace function public.check_line_day() returns trigger
language plpgsql set search_path = public as $$
declare v_role text; v_crew text[];
begin
  select role into v_role from lines where id = new.line_id;
  select crew_roles into v_crew from blocks where id = new.block_id;
  if not (v_role = any(v_crew)) then
    raise exception 'That block has no % position', v_role;
  end if;
  return new;
end $$;
drop trigger if exists trg_check_line_day on line_days;
create trigger trg_check_line_day before insert or update on line_days
  for each row execute function check_line_day();

-- ─── Coverage requirements: what we need each day of a typical week ─────────

create table if not exists coverage_requirements (
  id uuid primary key default gen_random_uuid(),
  dow smallint not null check (dow between 0 and 6),
  block_id uuid not null references blocks(id) on delete cascade,
  role text not null check (role in ('driver', 'attendant')),
  required_count integer not null default 1 check (required_count >= 0),
  unique (dow, block_id, role)
);

-- ─── Line assignments: who holds which line, and when ───────────────────────
-- bid_period_id gets its foreign key in the bidding phase.

create table if not exists line_assignments (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references lines(id) on delete restrict,
  employee_id uuid not null references employees(id) on delete restrict,
  bid_period_id uuid,
  source text not null default 'manual' check (source in ('manual', 'auto', 'growth_offer')),
  effective_from date not null,
  effective_to date,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  constraint line_assignments_dates_chk check (effective_to is null or effective_to >= effective_from)
);
create index if not exists idx_line_assignments_line on line_assignments(line_id);
create index if not exists idx_line_assignments_emp on line_assignments(employee_id);

-- One line per person at a time; a line can't hold more people than its positions.
create or replace function public.check_line_assignment() returns trigger
language plpgsql set search_path = public as $$
declare v_positions int; v_taken int;
begin
  if exists (
    select 1 from line_assignments a
    where a.employee_id = new.employee_id and a.id <> new.id
      and daterange(a.effective_from, a.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]')
  ) then
    raise exception 'This person already holds a line for part of that date range';
  end if;

  select positions into v_positions from lines where id = new.line_id;
  select count(*) into v_taken from line_assignments a
    where a.line_id = new.line_id and a.id <> new.id
      and daterange(a.effective_from, a.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]');
  if v_taken >= v_positions then
    raise exception 'This line has no open positions for that date range';
  end if;
  return new;
end $$;
drop trigger if exists trg_check_line_assignment on line_assignments;
create trigger trg_check_line_assignment before insert or update on line_assignments
  for each row execute function check_line_assignment();

-- ─── App settings ───────────────────────────────────────────────────────────

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ─── Audit log (filled automatically by triggers) ───────────────────────────

create table if not exists audit_log (
  id bigserial primary key,
  actor_employee_id uuid,
  actor_auth_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index if not exists idx_audit_entity on audit_log(entity, entity_id, at desc);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into audit_log (actor_employee_id, actor_auth_id, entity, entity_id, action, before, after)
  values (
    my_employee_id(), auth.uid(), tg_table_name, nullif(v_row->>'id', '')::uuid, lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['employees', 'blocks', 'lines', 'line_days', 'coverage_requirements', 'line_assignments', 'app_settings'] loop
    execute format('drop trigger if exists trg_audit on %I', t);
    execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function audit_row()', t);
  end loop;
end $$;

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table blocks enable row level security;
alter table lines enable row level security;
alter table line_days enable row level security;
alter table coverage_requirements enable row level security;
alter table line_assignments enable row level security;
alter table app_settings enable row level security;
alter table audit_log enable row level security;

-- Setup tables: everyone signed in reads; admins edit.
do $$
declare t text;
begin
  foreach t in array array['blocks', 'lines', 'line_days', 'coverage_requirements', 'app_settings'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (my_employee_id() is not null)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_admin_write', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admin_write', t);
  end loop;
end $$;

-- Line assignments: your own, or staff; staff assign.
drop policy if exists line_assignments_read on line_assignments;
create policy line_assignments_read on line_assignments for select to authenticated
  using (employee_id = my_employee_id() or is_staff());
drop policy if exists line_assignments_staff_write on line_assignments;
create policy line_assignments_staff_write on line_assignments for all to authenticated
  using (is_staff()) with check (is_staff());

-- Audit log: staff read only (rows are written by the trigger).
drop policy if exists audit_log_read on audit_log;
create policy audit_log_read on audit_log for select to authenticated using (is_staff());

-- ─── Realtime ───────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['blocks', 'lines', 'line_days', 'coverage_requirements', 'line_assignments', 'app_settings'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ─── Seed data (admin-editable afterwards) ──────────────────────────────────

insert into blocks (code, name, crew_roles, start_type, end_type, default_start, default_end, target_paid_hours, requires_gurney_qual, start_rule_note, end_rule_note, sort_order) values
  ('AM',   'Early',           '{driver}',           'variable', 'variable', null,    null,    8, false, '30 minutes before your first scheduled pickup', 'when your assigned trips are complete', 10),
  ('MID',  'Mid',             '{driver}',           'fixed',    'fixed',    '08:30', '17:00', 8, false, null, null, 20),
  ('PM',   'Late',            '{driver}',           'fixed',    'variable', '12:00', null,    8, false, null, 'last scheduled drop-off', 30),
  ('PMG',  'Late Gurney',     '{driver,attendant}', 'fixed',    'variable', '12:00', null,    8, true,  null, 'last scheduled drop-off', 40),
  ('SAT',  'Saturday',        '{driver}',           'fixed',    'variable', '12:30', null,    8, false, null, 'last scheduled drop-off', 50),
  ('SATG', 'Saturday Gurney', '{driver,attendant}', 'fixed',    'variable', '12:30', null,    8, true,  null, 'last scheduled drop-off', 60),
  ('SUNG', 'Sunday Gurney',   '{driver,attendant}', 'fixed',    'variable', '13:00', null,    6, true,  null, 'last scheduled drop-off', 70)
on conflict (code) do nothing;

insert into lines (code, name, employment_type, category, role, requires_gurney_qual, is_flex, positions, sort_order) values
  ('FT1',  'Mon–Fri Early',          'FT', 'core', 'driver',    false, false, 1, 10),
  ('FT2',  'Mon–Fri Mid',            'FT', 'core', 'driver',    false, false, 1, 20),
  ('FT3',  'Mon–Fri Late Gurney',    'FT', 'core', 'driver',    true,  false, 1, 30),
  ('PT1',  'Mon–Wed Late',           'PT', 'core', 'driver',    false, false, 1, 40),
  ('PT2',  'Thu–Fri Late + Saturday','PT', 'core', 'driver',    false, false, 1, 50),
  ('PT3',  'Tue–Wed Mid',            'PT', 'core', 'driver',    false, false, 1, 60),
  ('PT4',  'Weekend Gurney',         'PT', 'core', 'driver',    true,  false, 1, 70),
  ('FLEX', 'Flex / on-call',         'PT', 'core', 'driver',    false, true,  2, 80),
  ('A1',   'Mon–Fri Late Gurney',    'FT', 'core', 'attendant', false, false, 1, 90),
  ('A2',   'Weekend Gurney',         'PT', 'core', 'attendant', false, false, 1, 100)
on conflict (code) do nothing;

insert into line_days (line_id, dow, block_id)
select l.id, d.dow, b.id
from (values
  ('FT1', 1, 'AM'),  ('FT1', 2, 'AM'),  ('FT1', 3, 'AM'),  ('FT1', 4, 'AM'),  ('FT1', 5, 'AM'),
  ('FT2', 1, 'MID'), ('FT2', 2, 'MID'), ('FT2', 3, 'MID'), ('FT2', 4, 'MID'), ('FT2', 5, 'MID'),
  ('FT3', 1, 'PMG'), ('FT3', 2, 'PMG'), ('FT3', 3, 'PMG'), ('FT3', 4, 'PMG'), ('FT3', 5, 'PMG'),
  ('PT1', 1, 'PM'),  ('PT1', 2, 'PM'),  ('PT1', 3, 'PM'),
  ('PT2', 4, 'PM'),  ('PT2', 5, 'PM'),  ('PT2', 6, 'SAT'),
  ('PT3', 2, 'MID'), ('PT3', 3, 'MID'),
  ('PT4', 6, 'SATG'), ('PT4', 0, 'SUNG'),
  ('A1', 1, 'PMG'),  ('A1', 2, 'PMG'),  ('A1', 3, 'PMG'),  ('A1', 4, 'PMG'),  ('A1', 5, 'PMG'),
  ('A2', 6, 'SATG'), ('A2', 0, 'SUNG')
) as d(line_code, dow, block_code)
join lines l on l.code = d.line_code
join blocks b on b.code = d.block_code
on conflict (line_id, dow) do nothing;

-- Starting coverage = what the core lines provide. Edit in Admin → Coverage.
insert into coverage_requirements (dow, block_id, role, required_count)
select ld.dow, ld.block_id, l.role, sum(l.positions)
from line_days ld join lines l on l.id = ld.line_id
where l.category = 'core' and not l.is_flex
group by ld.dow, ld.block_id, l.role
on conflict (dow, block_id, role) do nothing;

insert into app_settings (key, value) values
  ('timezone',              '"America/Los_Angeles"'),
  ('workweek_start_dow',    '0'),
  ('am_start_deadline',     '"15:00"'),
  ('am_start_warning',      '"14:00"'),
  ('request_cutoff_hours',  '48'),
  ('pt_first_open_shifts',  'false'),
  ('daily_ot_hours',        '8'),
  ('weekly_ot_hours',       '40'),
  ('second_meal_hours',     '10')
on conflict (key) do nothing;
