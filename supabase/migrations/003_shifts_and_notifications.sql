-- 003 — Shifts (dated schedule) + in-app notifications
-- Run AFTER 002_scheduling_setup.sql. Safe to re-run.

-- ─── Shifts: a concrete dated instance of a block, assigned to a person ─────

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  block_id uuid not null references blocks(id) on delete restrict,
  role text not null check (role in ('driver', 'attendant')),
  employee_id uuid references employees(id) on delete restrict,   -- null = open shift (shift board, phase 3)
  line_id uuid references lines(id) on delete set null,
  assignment_id uuid references line_assignments(id) on delete set null,
  source text not null default 'line' check (source in ('line', 'manual', 'growth', 'board')),
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'cancelled')),
  -- Times are Pacific local times. Fixed blocks copy their defaults when the shift is created.
  -- Variable-start shifts (AM) stay null until dispatch posts the start the day before.
  start_time time,
  end_time time,
  start_posted_at timestamptz,
  start_posted_by uuid references employees(id),
  target_hours numeric(4,2) not null,
  notes text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_shifts_date on shifts(date);
create index if not exists idx_shifts_employee_date on shifts(employee_id, date);
-- A line assignment produces at most one shift per day.
create unique index if not exists uq_shifts_assignment_date on shifts(assignment_id, date) where assignment_id is not null;

-- ─── Notifications (in-app; shown in the bell) ─────────────────────────────

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  kind text not null,          -- e.g. 'am_start_posted', 'am_start_changed'
  title text not null,
  body text,
  shift_id uuid references shifts(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_emp on notifications(employee_id, created_at desc);

-- ─── Audit ──────────────────────────────────────────────────────────────────

drop trigger if exists trg_audit on shifts;
create trigger trg_audit after insert or update or delete on shifts
  for each row execute function audit_row();

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table shifts enable row level security;
alter table notifications enable row level security;

-- Shifts: your own, open shifts (for the shift board), or staff sees all. Staff write.
drop policy if exists shifts_read on shifts;
create policy shifts_read on shifts for select to authenticated
  using (employee_id = my_employee_id() or is_staff() or (status = 'open' and my_employee_id() is not null));
drop policy if exists shifts_staff_write on shifts;
create policy shifts_staff_write on shifts for all to authenticated
  using (is_staff()) with check (is_staff());

-- Notifications are personal: you read and mark your own; staff can send them.
drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications for select to authenticated
  using (employee_id = my_employee_id());
drop policy if exists notifications_mark_read on notifications;
create policy notifications_mark_read on notifications for update to authenticated
  using (employee_id = my_employee_id()) with check (employee_id = my_employee_id());
drop policy if exists notifications_staff_insert on notifications;
create policy notifications_staff_insert on notifications for insert to authenticated
  with check (is_staff());

-- ─── Realtime ───────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['shifts', 'notifications'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

insert into app_settings (key, value) values ('shifts_generated_through', 'null')
on conflict (key) do nothing;
