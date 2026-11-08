-- 011 — Sick calls go through a person. Drivers call or text the dispatch phone; dispatch records
-- the sick call in CAV Hub (shift → "Record a sick call"). Drivers can no longer call out in the app.
-- Run AFTER 010_driver_faq_tile.sql. Safe to re-run.

-- The driver-side call-out function stays for the record but nobody in the app can run it.
revoke all on function public.call_out_sick(uuid, text) from public, anon, authenticated;

-- The number on the "Call / Text dispatch" buttons (change it here if dispatch's number changes).
insert into app_settings (key, value) values ('dispatch_phone', '"+15302214826"') on conflict (key) do nothing;
