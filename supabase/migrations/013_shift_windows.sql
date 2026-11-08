-- 013 — Match the "Driver Shift Windows" proposal (November 2026), which is the source of truth.
-- Names: Sunrise, Midday, Star. No new features: each role is a block, and every floating start
-- (Sunrise 1 and 2, Star 1 and 2) is posted by dispatch by 3 pm the day before, as before.
--   Sunrise 1  FT  Mon–Fri  30 min before the first ride          (block AM)
--   Sunrise 2  FT  Mon–Fri  second call, posted                    (block AM2)
--   Midday 1   FT  Mon–Fri  8:30–5:00                              (block MID)
--   Midday 2   PT  on call for busy Mon–Thu, ~9:30–3:30 (like FLEX: no fixed shifts)
--   Star 1     FT  Mon–Fri  gurney van, posted (~11:00)            (block PMG, driver only)
--   Gurney attendant  PT  Mon–Fri  1:00 pm to last drop-off        (block GATT)
--   Star 2     FT  Mon–Thu  last one home, posted (~11:45)         (block PM)
--   Weekend Star crew  PT  Sat 12:30 (~7:00), Sun 1:00 (~5:30)     (blocks SATG, SUNG)
--   FLEX x2
-- Retires the Saturday morning van (SAT) and the PT1, PT2, PT3, PT5 lines.
-- Run AFTER 012. Safe to re-run (resets these blocks, lines and the starting coverage).

-- ─── Blocks ───────────────────────────────────────────────────────────────────
insert into blocks (code, name, crew_roles, start_type, end_type, default_start, default_end, target_paid_hours, requires_gurney_qual, start_rule_note, end_rule_note, sort_order, active)
values
  ('AM',   'Sunrise 1',        '{driver}',           'variable', 'variable', null,    null,    8,   false, '30 minutes before your first scheduled pickup', 'when your assigned trips are complete', 10, true),
  ('AM2',  'Sunrise 2',        '{driver}',           'variable', 'variable', null,    null,    8,   false, 'the time dispatch posts (second call, usually about 8 am)', 'when your assigned trips are complete', 15, true),
  ('MID',  'Midday 1',         '{driver}',           'fixed',    'fixed',    '08:30', '17:00', 8,   false, null, null, 20, true),
  ('PMG',  'Star 1 (gurney)',  '{driver}',           'variable', 'variable', null,    null,    8,   true,  'the time dispatch posts (usually about 11 am; wheelchair rides until 1 pm, then the gurney van)', 'last scheduled drop-off', 30, true),
  ('GATT', 'Gurney attendant', '{attendant}',        'fixed',    'variable', '13:00', null,    6,   false, null, 'last scheduled drop-off', 35, true),
  ('PM',   'Star 2',           '{driver}',           'variable', 'variable', null,    null,    8,   false, 'the time dispatch posts, worked back from the last drop-off (usually about 11:45 am)', 'last scheduled drop-off', 40, true),
  ('SATG', 'Saturday Star',    '{driver,attendant}', 'fixed',    'variable', '12:30', null,    6,   true,  null, 'last scheduled drop-off', 60, true),
  ('SUNG', 'Sunday Star',      '{driver,attendant}', 'fixed',    'variable', '13:00', null,    4.5, true,  null, 'last scheduled drop-off', 70, true)
on conflict (code) do update set
  name = excluded.name, crew_roles = excluded.crew_roles, start_type = excluded.start_type, end_type = excluded.end_type,
  default_start = excluded.default_start, default_end = excluded.default_end, target_paid_hours = excluded.target_paid_hours,
  requires_gurney_qual = excluded.requires_gurney_qual, start_rule_note = excluded.start_rule_note,
  end_rule_note = excluded.end_rule_note, sort_order = excluded.sort_order, active = true;

update blocks set active = false where code = 'SAT';

-- ─── Lines ────────────────────────────────────────────────────────────────────
insert into lines (code, name, employment_type, category, role, requires_gurney_qual, is_flex, positions, sort_order, hours_note, active)
values
  ('FT1',  'Sunrise 1',                    'FT', 'core', 'driver',    false, false, 1, 10,  'About 30–40 hrs/week', true),
  ('FT2',  'Sunrise 2',                    'FT', 'core', 'driver',    false, false, 1, 20,  'About 30–40 hrs/week', true),
  ('FT3',  'Midday 1',                     'FT', 'core', 'driver',    false, false, 1, 30,  '40 hrs/week', true),
  ('FT4',  'Star 1 (gurney)',              'FT', 'core', 'driver',    true,  false, 1, 40,  'About 30–40 hrs/week', true),
  ('FT5',  'Star 2 (Mon–Thu)',             'FT', 'core', 'driver',    false, false, 1, 50,  'About 32 hrs/week', true),
  ('MD2',  'Midday 2 (on call, Mon–Thu)',  'PT', 'core', 'driver',    false, true,  1, 60,  'Busy days only, about 9:30 am–3:30 pm', true),
  ('PT4',  'Weekend Star (gurney driver)', 'PT', 'core', 'driver',    true,  false, 1, 70,  'About 10–11 hrs/week', true),
  ('FLEX', 'Flex / on-call',               'PT', 'core', 'driver',    false, true,  2, 80,  'Sick calls, time off and busy days', true),
  ('A1',   'Gurney attendant (Mon–Fri)',   'PT', 'core', 'attendant', false, false, 1, 90,  'About 30 hrs/week', true),
  ('A2',   'Weekend Star (attendant)',     'PT', 'core', 'attendant', false, false, 1, 100, 'About 10–11 hrs/week', true)
on conflict (code) do update set
  name = excluded.name, employment_type = excluded.employment_type, role = excluded.role,
  requires_gurney_qual = excluded.requires_gurney_qual, is_flex = excluded.is_flex, positions = excluded.positions,
  sort_order = excluded.sort_order, hours_note = excluded.hours_note, active = true;

update lines set active = false where code in ('PT1', 'PT2', 'PT3', 'PT5');

-- Days for each line (replaces whatever the lines had).
delete from line_days where line_id in (select id from lines where code in ('FT1','FT2','FT3','FT4','FT5','MD2','PT4','FLEX','A1','A2'));
insert into line_days (line_id, dow, block_id)
select l.id, d.dow, b.id
from (values
  ('FT1', 1, 'AM'),  ('FT1', 2, 'AM'),  ('FT1', 3, 'AM'),  ('FT1', 4, 'AM'),  ('FT1', 5, 'AM'),
  ('FT2', 1, 'AM2'), ('FT2', 2, 'AM2'), ('FT2', 3, 'AM2'), ('FT2', 4, 'AM2'), ('FT2', 5, 'AM2'),
  ('FT3', 1, 'MID'), ('FT3', 2, 'MID'), ('FT3', 3, 'MID'), ('FT3', 4, 'MID'), ('FT3', 5, 'MID'),
  ('FT4', 1, 'PMG'), ('FT4', 2, 'PMG'), ('FT4', 3, 'PMG'), ('FT4', 4, 'PMG'), ('FT4', 5, 'PMG'),
  ('FT5', 1, 'PM'),  ('FT5', 2, 'PM'),  ('FT5', 3, 'PM'),  ('FT5', 4, 'PM'),
  ('PT4', 6, 'SATG'), ('PT4', 0, 'SUNG'),
  ('A1', 1, 'GATT'), ('A1', 2, 'GATT'), ('A1', 3, 'GATT'), ('A1', 4, 'GATT'), ('A1', 5, 'GATT'),
  ('A2', 6, 'SATG'), ('A2', 0, 'SUNG')
) as d(line_code, dow, block_code)
join lines l on l.code = d.line_code
join blocks b on b.code = d.block_code;

-- Starting coverage = what the core lines provide (edit in Admin → Coverage afterwards).
delete from coverage_requirements;
insert into coverage_requirements (dow, block_id, role, required_count)
select ld.dow, ld.block_id, l.role, sum(l.positions)
from line_days ld join lines l on l.id = ld.line_id
where l.category = 'core' and not l.is_flex and l.active
group by ld.dow, ld.block_id, l.role;
