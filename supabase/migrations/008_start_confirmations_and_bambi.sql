-- 008 — Start-time confirmations (replaces texting drivers their start time) and the weekly
-- Bambi checklist (what changed since next week was entered in Bambi).
-- Run AFTER 007_link_tiles.sql. Safe to re-run.

-- ─── Start-time confirmations ───────────────────────────────────────────────

alter table shifts
  add column if not exists first_pickup_time time,        -- the start is normally 30 min before this
  add column if not exists start_confirmed_at timestamptz; -- driver tapped Confirm (cleared when the time changes)

insert into app_settings (key, value) values ('start_confirm_by', '"19:00"') on conflict (key) do nothing;

-- The driver confirms their own posted start time.
create or replace function public.confirm_shift_start(p_shift uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := require_me(); s shifts;
begin
  select * into s from shifts where id = p_shift;
  if not found or s.employee_id is distinct from me or s.status <> 'scheduled' then
    raise exception 'This isn''t your shift.';
  end if;
  if s.start_time is null or s.start_posted_at is null then raise exception 'Your start time hasn''t been posted yet.'; end if;
  if s.date < today_la() then raise exception 'That shift has already passed.'; end if;
  update shifts set start_confirmed_at = now() where id = p_shift;
end $$;
revoke all on function public.confirm_shift_start(uuid) from public, anon;
grant execute on function public.confirm_shift_start(uuid) to authenticated;

-- A confirmation only counts for the time and person it was given for.
create or replace function public.reset_start_confirmation() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.start_time is distinct from old.start_time or new.employee_id is distinct from old.employee_id)
     and new.start_confirmed_at is not distinct from old.start_confirmed_at then
    new.start_confirmed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_reset_start_confirmation on shifts;
create trigger trg_reset_start_confirmation before update on shifts
  for each row execute function reset_start_confirmation();

-- ─── Bambi weekly checklist ─────────────────────────────────────────────────

-- A week (Monday start) that dispatch has entered in Bambi.
create table if not exists bambi_weeks (
  week_start date primary key,
  entered_at timestamptz not null default now(),
  entered_by uuid references employees(id)
);

-- Changes to shifts in an entered week: each one is something to update in Bambi.
create table if not exists bambi_changes (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references shifts(id) on delete set null,
  date date not null,
  summary text not null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references employees(id)
);
create index if not exists idx_bambi_changes_open on bambi_changes(done_at, date);

create or replace function public.emp_name(p_emp uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from employees where id = p_emp), 'open')
$$;

-- Record a Bambi update whenever a shift in an entered week changes hands, opens up,
-- gets cancelled, is added or removed, or gets a new start time.
create or replace function public.track_bambi_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare s shifts; label text; msg text;
begin
  s := coalesce(new, old);
  if not exists (select 1 from bambi_weeks where week_start = date_trunc('week', s.date)::date) then
    return coalesce(new, old);
  end if;
  select to_char(s.date, 'Dy Mon FMDD') || ' ' || b.code || case when s.role = 'attendant' then ' attendant' else '' end
    into label from blocks b where b.id = s.block_id;

  if tg_op = 'INSERT' then
    msg := label || ': added — ' || emp_name(new.employee_id);
  elsif tg_op = 'DELETE' then
    msg := label || ': removed (' || emp_name(old.employee_id) || ')';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    msg := label || ': cancelled (' || emp_name(old.employee_id) || ')';
  elsif new.employee_id is distinct from old.employee_id then
    msg := label || ': ' || emp_name(old.employee_id) || ' → ' || emp_name(new.employee_id);
  elsif new.start_time is distinct from old.start_time and new.start_time is not null then
    msg := label || ': ' || emp_name(new.employee_id) || ' starts ' || to_char(new.start_time, 'FMHH12:MI am');
  else
    return coalesce(new, old);
  end if;

  insert into bambi_changes (shift_id, date, summary)
  values (case when tg_op = 'DELETE' then null else s.id end, s.date, msg);
  return coalesce(new, old);
end $$;

drop trigger if exists trg_bambi_change on shifts;
create trigger trg_bambi_change after insert or update or delete on shifts
  for each row execute function track_bambi_change();

revoke all on function public.track_bambi_change() from public, anon, authenticated;
revoke all on function public.emp_name(uuid) from public, anon, authenticated;

alter table bambi_weeks enable row level security;
alter table bambi_changes enable row level security;
drop policy if exists bambi_weeks_staff on bambi_weeks;
create policy bambi_weeks_staff on bambi_weeks for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists bambi_changes_staff on bambi_changes;
create policy bambi_changes_staff on bambi_changes for all to authenticated using (is_staff()) with check (is_staff());

do $$
declare t text;
begin
  foreach t in array array['bambi_weeks', 'bambi_changes'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ─── Linked tiles: known links (only fills empty ones; never overwrites an admin's link) ──

update link_tiles set name = 'Coggno Training' where name = 'Pathway Training';
update link_tiles set url = 'https://login.coggno.com/cas/login?service=https%3A%2F%2Fcoggno.com%2Fv2%2Faccount'
  where name = 'Coggno Training' and coalesce(url, '') = '';
update link_tiles set url = 'https://bbsitimenet.cloud.centralservers.com/'
  where name = 'Time Clock (BBSI)' and coalesce(url, '') = '';
update link_tiles set url = 'https://docs.google.com/document/d/1zlem6GIks0G6xGtXehouoURLarVEWYsM9Jr8mDMb3RM/edit?usp=sharing'
  where name = 'Employee Handbook (2027)' and coalesce(url, '') = '';
update link_tiles set url = 'tel:+15302214826'
  where name = 'Call Dispatch' and coalesce(url, '') = '';
-- Pre-trip inspections are done in Bambi; no separate tile.
delete from link_tiles where name = 'Pre-trip inspection (Bambi)';
