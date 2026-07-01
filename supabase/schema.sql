-- Care-A-Van Connect — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run

-- Drivers roster
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  push_subscription text,
  created_at timestamptz default now()
);

-- Company announcements
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  video_url text,
  requires_ack boolean not null default false,
  created_by text not null default 'dispatch',
  created_at timestamptz default now()
);

-- Per-driver view/acknowledgment tracking
create table if not exists announcement_views (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  viewed_at timestamptz default now(),
  acknowledged_at timestamptz,
  unique(announcement_id, driver_id)
);

-- 1:1 messages between drivers and dispatch
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id) on delete cascade,
  sender text not null check (sender in ('driver', 'dispatch')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- Enable real-time on all tables
alter publication supabase_realtime add table drivers;
alter publication supabase_realtime add table announcements;
alter publication supabase_realtime add table announcement_views;
alter publication supabase_realtime add table messages;

-- Row Level Security: open for anon (PIN controls dispatch access in the app)
-- For a small internal team this is acceptable; upgrade to proper auth later if needed
alter table drivers enable row level security;
alter table announcements enable row level security;
alter table announcement_views enable row level security;
alter table messages enable row level security;

create policy "allow all" on drivers for all using (true) with check (true);
create policy "allow all" on announcements for all using (true) with check (true);
create policy "allow all" on announcement_views for all using (true) with check (true);
create policy "allow all" on messages for all using (true) with check (true);

-- Indexes for common queries
create index if not exists idx_announcement_views_driver on announcement_views(driver_id);
create index if not exists idx_announcement_views_ann on announcement_views(announcement_id);
create index if not exists idx_messages_driver on messages(driver_id);
create index if not exists idx_messages_unread on messages(driver_id, sender, read_at) where read_at is null;
