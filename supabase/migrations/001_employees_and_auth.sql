-- 001 — Employees + real logins + Row Level Security
-- Run AFTER supabase/schema.sql. Safe to re-run.
--
-- What this does:
--   * Renames `drivers` → `employees` (existing announcements/messages stay linked)
--   * Adds role, FT/PT, seniority, gurney qualification, active flag, login link
--   * Stores phone numbers in a separate staff-only table (the PIN is the last 4 digits)
--   * Replaces the old "allow all" security rules with per-person / per-role rules

create extension if not exists pgcrypto;

-- ─── Employees ──────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'drivers')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'employees') then
    alter table drivers rename to employees;
  end if;
end $$;

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  push_subscription text,
  created_at timestamptz default now()
);

alter table employees
  add column if not exists role text not null default 'driver',
  add column if not exists employment_type text not null default 'PT',
  add column if not exists seniority_date date,
  add column if not exists hire_seq integer,
  add column if not exists gurney_qualified boolean not null default false,
  add column if not exists active boolean not null default true,
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

do $$ begin
  alter table employees add constraint employees_role_chk
    check (role in ('driver', 'attendant', 'dispatcher', 'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table employees add constraint employees_employment_type_chk
    check (employment_type in ('FT', 'PT'));
exception when duplicate_object then null; end $$;

-- Phone numbers live here so drivers can't read each other's (the last 4 digits are the PIN).
create table if not exists employee_contacts (
  employee_id uuid primary key references employees(id) on delete cascade,
  phone text not null default '',
  updated_at timestamptz not null default now()
);

-- Used by the pin-login function to lock out repeated wrong guesses.
create table if not exists login_attempts (
  id bigserial primary key,
  employee_id uuid references employees(id) on delete cascade,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_login_attempts_emp on login_attempts(employee_id, attempted_at desc);

-- ─── Helper functions used by security rules ────────────────────────────────

create or replace function public.my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees where auth_user_id = auth.uid() and active
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from employees where auth_user_id = auth.uid() and active
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('dispatcher', 'admin') from employees where auth_user_id = auth.uid() and active), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from employees where auth_user_id = auth.uid() and active), false)
$$;

-- Names shown on the login screen (before anyone is signed in). Names only — nothing else.
create or replace function public.login_directory()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select id, name, role from employees where active order by name
$$;
grant execute on function public.login_directory() to anon, authenticated;

-- Lets a signed-in person save their own push subscription without write access to employees.
create or replace function public.set_my_push_subscription(sub text) returns void
language sql security definer set search_path = public as $$
  update employees set push_subscription = sub where id = my_employee_id()
$$;
grant execute on function public.set_my_push_subscription(text) to authenticated;

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table employees enable row level security;
alter table employee_contacts enable row level security;
alter table login_attempts enable row level security; -- no policies: server-only
alter table announcements enable row level security;
alter table announcement_views enable row level security;
alter table messages enable row level security;

drop policy if exists "allow all" on employees;
drop policy if exists "allow all" on announcements;
drop policy if exists "allow all" on announcement_views;
drop policy if exists "allow all" on messages;

-- "Signed in" below always means: signed in AND linked to an active employee.

-- employees: everyone signed in can see the team (names, roles, seniority); admins edit.
drop policy if exists employees_read on employees;
create policy employees_read on employees for select to authenticated using (my_employee_id() is not null);
drop policy if exists employees_admin_write on employees;
create policy employees_admin_write on employees for all to authenticated
  using (is_admin()) with check (is_admin());

-- employee_contacts: your own row, or staff; admins edit.
drop policy if exists contacts_read on employee_contacts;
create policy contacts_read on employee_contacts for select to authenticated
  using (employee_id = my_employee_id() or is_staff());
drop policy if exists contacts_admin_write on employee_contacts;
create policy contacts_admin_write on employee_contacts for all to authenticated
  using (is_admin()) with check (is_admin());

-- announcements: everyone reads; staff post.
drop policy if exists announcements_read on announcements;
create policy announcements_read on announcements for select to authenticated using (my_employee_id() is not null);
drop policy if exists announcements_staff_write on announcements;
create policy announcements_staff_write on announcements for all to authenticated
  using (is_staff()) with check (is_staff());

-- announcement_views: your own, or staff.
drop policy if exists views_read on announcement_views;
create policy views_read on announcement_views for select to authenticated
  using (driver_id = my_employee_id() or is_staff());
drop policy if exists views_insert on announcement_views;
create policy views_insert on announcement_views for insert to authenticated
  with check (driver_id = my_employee_id());
drop policy if exists views_update on announcement_views;
create policy views_update on announcement_views for update to authenticated
  using (driver_id = my_employee_id()) with check (driver_id = my_employee_id());

-- messages: your own thread, or staff.
drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated
  using (driver_id = my_employee_id() or is_staff());
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (
    (driver_id = my_employee_id() and sender = 'driver')
    or (is_staff() and sender = 'dispatch')
  );
drop policy if exists messages_update on messages;
create policy messages_update on messages for update to authenticated
  using (driver_id = my_employee_id() or is_staff())
  with check (driver_id = my_employee_id() or is_staff());

-- ─── Realtime ───────────────────────────────────────────────────────────────

do $$ begin
  alter publication supabase_realtime add table employee_contacts;
exception when duplicate_object then null; end $$;
