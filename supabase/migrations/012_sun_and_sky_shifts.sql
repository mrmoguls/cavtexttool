-- 012 — Sun-and-sky shift model (decided 2026-11-08).
--   * Friendlier block names: Sunrise, High Noon, Big Dipper, and Stars for the gurney runs.
--     Codes stay the same (AM, MID, PM, PMG …) for the roster and Bambi.
--   * Times: High Noon 8:00–5:00; Saturday Sunrise 9:00 to last drop-off (~1 pm, 4 hrs);
--     Saturday and Sunday Star start 1:30; Big Dipper and Star target 6 hrs (they end 5–8 pm).
--   * Two High Noon lines (FT2, FT3). The weekday gurney driver line becomes part-time PT5;
--     the weekday gurney attendant line A1 becomes part-time (hours depend on orders).
--   * Lines get an "expected hours" note shown on the bid screen.
--   * Bidding: anyone can bid on any line they're qualified for (no full-time/part-time split).
-- Run AFTER 011_sick_calls_by_phone.sql, once. Re-running is harmless but resets block names/times
-- and line names/notes to these values.

alter table lines add column if not exists hours_note text;

-- ─── Blocks ───────────────────────────────────────────────────────────────────
update blocks set name = 'Sunrise' where code = 'AM';
update blocks set name = 'High Noon', default_start = '08:00', default_end = '17:00' where code = 'MID';
update blocks set name = 'Big Dipper', target_paid_hours = 6 where code = 'PM';
update blocks set name = 'Star', target_paid_hours = 6 where code = 'PMG';
update blocks set name = 'Saturday Sunrise', default_start = '09:00', target_paid_hours = 4 where code = 'SAT';
update blocks set name = 'Saturday Star', default_start = '13:30', target_paid_hours = 6 where code = 'SATG';
update blocks set name = 'Sunday Star', default_start = '13:30', target_paid_hours = 6 where code = 'SUNG';

-- ─── Lines ────────────────────────────────────────────────────────────────────
-- The old FT3 (weekday gurney driver) becomes part-time PT5, freeing FT3 for the second High Noon line.
update lines set code = 'PT5', employment_type = 'PT', sort_order = 75
where code = 'FT3' and requires_gurney_qual and not exists (select 1 from lines where code = 'PT5');

insert into lines (code, name, employment_type, category, role, requires_gurney_qual, is_flex, positions, sort_order)
select 'FT3', 'Mon–Fri High Noon', 'FT', 'core', 'driver', false, false, 1, 30
where not exists (select 1 from lines where code = 'FT3');

insert into line_days (line_id, dow, block_id)
select l.id, d.dow, b.id
from lines l, blocks b, generate_series(1, 5) as d(dow)
where l.code = 'FT3' and b.code = 'MID'
on conflict (line_id, dow) do nothing;

update lines set name = v.name, hours_note = v.hours, employment_type = v.ft
from (values
  ('FT1', 'Mon–Fri Sunrise',                      'About 30–40 hrs/week', 'FT'),
  ('FT2', 'Mon–Fri High Noon',                    '40 hrs/week',          'FT'),
  ('FT3', 'Mon–Fri High Noon',                    '40 hrs/week',          'FT'),
  ('PT1', 'Mon–Wed Big Dipper',                   'About 15–24 hrs/week', 'PT'),
  ('PT2', 'Thu–Fri Big Dipper + Saturday Sunrise','About 14–20 hrs/week', 'PT'),
  ('PT3', 'Tue–Wed High Noon',                    '16 hrs/week',          'PT'),
  ('PT4', 'Weekend Stars (gurney)',               'About 12 hrs/week',    'PT'),
  ('PT5', 'Mon–Fri Star (gurney)',                'About 25–40 hrs/week', 'PT'),
  ('A1',  'Mon–Fri Star (attendant)',             'About 25–40 hrs/week', 'PT'),
  ('A2',  'Weekend Stars (attendant)',            'About 12 hrs/week',    'PT')
) as v(code, name, hours, ft)
where lines.code = v.code;

-- High Noon coverage = the High Noon lines (two full-time lines Mon–Fri, plus PT3 on Tue/Wed).
update coverage_requirements c set required_count = x.needed
from (
  select ld.dow, ld.block_id, l.role, sum(l.positions)::int as needed
  from line_days ld join lines l on l.id = ld.line_id join blocks b on b.id = ld.block_id
  where b.code = 'MID' and l.category = 'core' and not l.is_flex and l.active
  group by ld.dow, ld.block_id, l.role
) x
where c.dow = x.dow and c.block_id = x.block_id and c.role = x.role and c.required_count < x.needed;

-- ─── Bidding: anyone can bid on any line they're qualified for ────────────────
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
  if not e.bids_on_lines then return 'Backup drivers pick up open shifts instead of bidding on lines.'; end if;
  -- Availability from the schedule sheet: a line can't need you on a day you're unavailable.
  select string_agg(trim(to_char(date '2026-01-04' + d.dow, 'Day')), ', ' order by d.dow) into av
  from line_days d join employee_contacts c on c.employee_id = p_emp
  where d.line_id = p_line and c.availability is not null
    and coalesce((c.availability ->> d.dow::text)::numeric, 0) = 0;
  if av is not null then return 'Not available ' || av || ' (schedule sheet).'; end if;
  return null;
end $$;
revoke all on function public.line_problem(uuid, uuid, boolean) from public, anon, authenticated;
