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

-- Slice 17a: OBU Health's client profile + platforms (same as 20261125130000_multi_client.sql; idempotent).
-- On the hosted project the migration fills these; this covers a fresh local database, where the seed
-- runs after the migrations.
-- From the multi-client spike (INTEGRATIONS.md › Multi-client spike): obuhealth.com scrape + Groq profile,
-- with the invented "FDA disclaimer" rule left out.
update public.clients set
  website = 'https://www.obuhealth.com',
  description = 'Prescription weight loss, GLP-1, NAD+ and peptide treatments online, with US board-certified doctors.',
  industry = 'Telehealth · weight loss and wellness',
  audience = 'Adults looking for prescription weight-loss or longevity treatment',
  country = 'US',
  language = 'en',
  initials = 'OB',
  brand_color = null,
  regulated = array['health', 'medical claims', 'weight loss', 'pharma'],
  audience_is_kids = false,
  health_months = true,
  content_rules = jsonb_build_array(
    jsonb_build_object('id', 'obu-1', 'source', 'blip',
      'rule', 'No before / after photos or guaranteed weight loss',
      'why', 'Weight-loss results must be typical and backed up.',
      'quote', 'Clinically backed GLP-1 for appetite control and sustainable weight loss.'),
    jsonb_build_object('id', 'obu-2', 'source', 'blip',
      'rule', 'Don''t imply treatment without a doctor''s review',
      'why', 'Prescriptions follow a licensed provider''s assessment.',
      'quote', 'US board-certified doctors'),
    jsonb_build_object('id', 'obu-3', 'source', 'blip',
      'rule', 'Adults only: don''t aim posts at under-18s',
      'why', 'Prescription weight-loss treatment is for adults.',
      'quote', 'Get prescription weight loss, GLP-1, NAD+ and peptide treatments online.')
  )
where slug = 'obu-health';

-- OBU's platforms: the footer links Instagram, TikTok, X, Pinterest, YouTube (always on; X, Pinterest and
-- YouTube show "coming later" until supported); LinkedIn and Facebook were added by the team.
insert into public.client_platforms (client_id, platform, state, source, account_url, account_handle)
select c.id, p.platform, 'on', p.source, p.url, p.handle
from public.clients c
cross join (values
  ('instagram', 'website', 'https://www.instagram.com/obuhealth', 'obuhealth'),
  ('tiktok',    'website', 'https://www.tiktok.com/@obuhealth',   'obuhealth'),
  ('x',         'website', 'https://x.com/obuhealth',             'obuhealth'),
  ('pinterest', 'website', 'https://www.pinterest.com/obuhealth', 'obuhealth'),
  ('youtube',   'website', 'https://www.youtube.com/@obuhealth',  'obuhealth'),
  ('linkedin',  'team',    null, null),
  ('facebook',  'team',    null, null)
) as p(platform, source, url, handle)
where c.slug = 'obu-health'
on conflict (client_id, platform) do nothing;
