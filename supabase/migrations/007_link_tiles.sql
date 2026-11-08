-- 007 — Linked tiles: the driver's home screen of links to other systems (Bambi, time clock,
-- Coggno training, handbook, call dispatch …), edited by admins, with tap tracking.
-- Run AFTER 006_compliance_and_time_off.sql. Safe to re-run.

create table if not exists link_tiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'link',          -- built-in icon name (car, clock, phone …)
  icon_url text,                              -- optional real app icon image
  url text,                                   -- null/empty = placeholder ("not set up yet")
  fallback_url text,                          -- e.g. website or app store if the app doesn't open
  roles_visible text[] not null default '{driver,attendant,dispatcher,admin}',
  sort_order integer not null default 0,
  help_text text,                             -- short sign-in help shown under the tile
  shift_label text,                           -- if set, shown as a button on today's shift card
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint link_tiles_roles_chk check (roles_visible <@ array['driver', 'attendant', 'dispatcher', 'admin'])
);

create table if not exists tile_taps (
  id bigserial primary key,
  tile_id uuid not null references link_tiles(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  context text not null default 'home' check (context in ('home', 'shift')),
  tapped_at timestamptz not null default now()
);
create index if not exists idx_tile_taps_tile on tile_taps(tile_id, tapped_at desc);

drop trigger if exists trg_audit on link_tiles;
create trigger trg_audit after insert or update or delete on link_tiles for each row execute function audit_row();

alter table link_tiles enable row level security;
alter table tile_taps enable row level security;

-- Everyone sees the active tiles meant for their role (drivers who dispatch also see dispatch tiles);
-- admins see and edit all.
drop policy if exists link_tiles_read on link_tiles;
create policy link_tiles_read on link_tiles for select to authenticated using (
  is_admin() or (active and (my_role() = any(roles_visible) or (is_staff() and 'dispatcher' = any(roles_visible))))
);
drop policy if exists link_tiles_admin on link_tiles;
create policy link_tiles_admin on link_tiles for all to authenticated using (is_admin()) with check (is_admin());

-- Taps: you record your own; staff can read them for usage counts.
drop policy if exists tile_taps_insert on tile_taps;
create policy tile_taps_insert on tile_taps for insert to authenticated with check (employee_id = my_employee_id());
drop policy if exists tile_taps_read on tile_taps;
create policy tile_taps_read on tile_taps for select to authenticated using (is_staff());

do $$ begin
  alter publication supabase_realtime add table link_tiles;
exception when duplicate_object then null; end $$;

-- Starter tiles from the roadmap. Links not known yet are left empty: admins fill them in under
-- Admin → Linked tiles. Until then, tapping one says it isn't set up yet.
insert into link_tiles (name, icon, url, roles_visible, sort_order, help_text, shift_label)
select * from (values
  ('Bambi – Your Rides', 'car', null::text, '{driver,attendant,dispatcher,admin}'::text[], 10, 'Sign in with your Bambi driver login. Stay signed in on this phone.', 'Today''s rides'),
  ('Time Clock (BBSI)', 'clock', 'https://bbsitimenet.cloud.centralservers.com/', '{driver,attendant,dispatcher,admin}'::text[], 30, 'Clock in and out for payroll.', 'Clock in'),
  ('Coggno Training', 'graduation-cap', 'https://login.coggno.com/cas/login?service=https%3A%2F%2Fcoggno.com%2Fv2%2Faccount', '{driver,attendant,dispatcher,admin}'::text[], 40, 'Required trainings (HIPAA, FWA, bloodborne pathogens …).', null),
  ('Employee Handbook (2027)', 'book-open', 'https://docs.google.com/document/d/1zlem6GIks0G6xGtXehouoURLarVEWYsM9Jr8mDMb3RM/edit?usp=sharing', '{driver,attendant,dispatcher,admin}'::text[], 50, null, null),
  ('Call Dispatch', 'phone', 'tel:+15302214826', '{driver,attendant}'::text[], 60, null, null),
  ('Accident / Emergency Instructions', 'triangle-alert', null, '{driver,attendant}'::text[], 70, 'What to do at the scene.', null),
  ('Repair Quote Review ("Ask Ryan")', 'wrench', null, '{dispatcher,admin}'::text[], 80, 'For staff who handle shop quotes.', null)
) as v(name, icon, url, roles_visible, sort_order, help_text, shift_label)
where not exists (select 1 from link_tiles);
