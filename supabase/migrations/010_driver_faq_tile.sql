-- 010 — Driver FAQ tile (the Google Doc that will also feed the "Ask a question" helper, roadmap phase 2).
-- Run AFTER 009_push_notifications.sql. Safe to re-run: adds the tile only if it isn't there.

insert into link_tiles (name, icon, url, roles_visible, sort_order, help_text, shift_label)
select 'Driver FAQ', 'circle-help', 'https://docs.google.com/document/d/1OMl7J2WxaU8HX5MxwnpamvW1r77s5MSnycS6kxYFc8o/edit?usp=sharing',
       '{driver,attendant,dispatcher,admin}', 55, 'Answers to common questions. Ask Ryan if yours isn''t there.', null
where not exists (select 1 from link_tiles where name = 'Driver FAQ');
