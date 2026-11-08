-- 009 — Phone push notifications.
-- Each phone that turns on notifications is saved here. Whenever something lands in the bell
-- (start times, swaps, approvals, alerts …), a message arrives, or an announcement is posted,
-- the database asks the "send-push" edge function to deliver it to that person's phones.
-- Run AFTER 008_start_confirmations_and_bambi.sql. Safe to re-run.
--
-- After running it, fill in push_config (see SETUP.md, "Push notifications"):
--   insert into push_config (function_url, secret) values ('https://<project>.supabase.co/functions/v1/send-push', '<PUSH_WEBHOOK_SECRET>')
--   on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;
-- Until then nothing is sent and everything else keeps working.

-- pg_net lets the database make the web request to the edge function.
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net not available here; push notifications will not be sent from this database.';
end $$;

-- ─── Phones ───────────────────────────────────────────────────────────────────

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  endpoint text not null unique,          -- the phone's push address (one row per phone/browser)
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_push_subs_emp on push_subscriptions(employee_id);

alter table push_subscriptions enable row level security;
-- You can see which of your own phones are signed up; changes only go through the functions below.
drop policy if exists push_subs_read on push_subscriptions;
create policy push_subs_read on push_subscriptions for select to authenticated using (employee_id = my_employee_id());

-- Save this phone for the signed-in person. If someone else signs in on the same phone,
-- the phone moves to them (no pushes for the previous person on a shared phone).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := my_employee_id();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Invalid push subscription';
  end if;
  insert into push_subscriptions (employee_id, endpoint, p256dh, auth, user_agent)
  values (me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set employee_id = excluded.employee_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen_at = now();
end $$;

-- Forget this phone (signing out, or turning notifications off).
create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and employee_id = my_employee_id();
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- ─── Where to send (filled in once by an admin; nobody can read it from the app) ──

create table if not exists push_config (
  id boolean primary key default true check (id),
  function_url text not null,
  secret text not null
);
alter table push_config enable row level security;  -- no policies: app users can't read or change it
revoke all on push_config from public, anon, authenticated;

-- ─── Sending ──────────────────────────────────────────────────────────────────

-- Hand a push to the edge function. Never fails the change that caused it.
create or replace function public.queue_push(p_employee_ids uuid[], p_title text, p_body text, p_open text, p_tag text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare cfg push_config;
begin
  if p_employee_ids is null or cardinality(p_employee_ids) = 0 then return; end if;
  select * into cfg from push_config where id;
  if cfg is null then return; end if;
  -- Only people who have a phone signed up.
  select array_agg(distinct employee_id) into p_employee_ids
  from push_subscriptions where employee_id = any(p_employee_ids);
  if p_employee_ids is null then return; end if;
  perform net.http_post(
    url := cfg.function_url,
    body := jsonb_build_object('employee_ids', p_employee_ids, 'title', p_title, 'body', coalesce(p_body, ''), 'open', p_open, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret)
  );
exception when others then
  raise warning 'push not sent: %', sqlerrm;
end $$;
revoke all on function public.queue_push(uuid[], text, text, text, text) from public, anon, authenticated;

-- Everything in the bell also goes to the phone.
create or replace function public.push_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform queue_push(array[new.employee_id], new.title, new.body, 'notifications', new.kind);
  return new;
end $$;
drop trigger if exists trg_push_notification on notifications;
create trigger trg_push_notification after insert on notifications for each row execute function push_notification();

-- Messages: dispatch → the driver; driver → everyone who dispatches.
create or replace function public.push_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.sender = 'dispatch' then
    perform queue_push(array[new.driver_id], 'Message from dispatch', left(new.body, 140), 'messages', 'message');
  else
    select name into who from employees where id = new.driver_id;
    perform queue_push(
      (select array_agg(id) from employees where active and (role = 'dispatcher' or can_dispatch) and id <> new.driver_id),
      'Message from ' || coalesce(who, 'a driver'), left(new.body, 140), 'inbox', 'message-' || new.driver_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_push_message on messages;
create trigger trg_push_message after insert on messages for each row execute function push_message();

-- Announcements: everyone active.
create or replace function public.push_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform queue_push(
    (select array_agg(id) from employees where active),
    'New announcement: ' || new.title,
    case when new.requires_ack then 'Please read and acknowledge.' else left(new.body, 140) end,
    'feed', 'announcement');
  return new;
end $$;
drop trigger if exists trg_push_announcement on announcements;
create trigger trg_push_announcement after insert on announcements for each row execute function push_announcement();

revoke all on function public.push_notification() from public, anon, authenticated;
revoke all on function public.push_message() from public, anon, authenticated;
revoke all on function public.push_announcement() from public, anon, authenticated;
