-- Seed (MVP): OBU Health + 6 competitors. Handles from Figma frame 07, without "@".
-- Safe to run more than once: existing rows are left untouched (so team edits are never overwritten).
-- Handle statuses stay 'unchecked' until the handle check runs (Slice 8).

insert into public.clients (name, slug)
values ('OBU Health', 'obu-health')
on conflict (slug) do nothing;

insert into public.competitors (client_id, name, initials, instagram_handle, tiktok_handle)
select c.id, v.name, v.initials, v.instagram, v.tiktok
from public.clients c
cross join (
  values
    ('Ro',             'Ro', 'ro.co',          'ro'),
    ('WeightWatchers', 'WW', 'weightwatchers', 'weightwatchers'),
    ('Hims',           'Hi', 'hims',           'hims'),
    ('Hers',           'He', 'hers',           'hers'),
    ('Found',          'Fo', 'joinfound',      'joinfound'),
    ('LifeMD',         'LM', 'lifemd',         'lifemd')
) as v (name, initials, instagram, tiktok)
where c.slug = 'obu-health'
on conflict (client_id, name) do nothing;
