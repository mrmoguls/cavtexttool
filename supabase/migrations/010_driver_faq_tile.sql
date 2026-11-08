-- 010 — Driver FAQ tile (the Google Doc that will also feed the "Ask a question" helper, roadmap phase 2).
-- Run AFTER 009_push_notifications.sql. Safe to re-run: adds the tile only if it isn't there.

insert into link_tiles (name, icon, url, roles_visible, sort_order, help_text, shift_label)
select 'Driver FAQ', 'circle-help', 'https://docs.google.com/document/d/1dEkED3bjbI0gqBw53WLE-3h2Z5758XINufapKwUjNTg/edit?usp=sharing',
       '{driver,attendant,dispatcher,admin}', 55, 'Answers to common questions. Ask Ryan if yours isn''t there.', null
where not exists (select 1 from link_tiles where name = 'Driver FAQ');
