-- Slice 17a — Multi-client foundation. See docs/BUILD_PLAN.md › Slice 17, docs/DATA_MODEL.md.
--
-- • clients: brand / profile columns. OBU Health (the seeded client) is client #1: its row and every
--   table pointing at it stay as they are; only the new columns are filled in below.
-- • client_platforms: which platforms each client tracks + the client's own accounts (for "us vs them").
--   Rule (Fatima, 24 Nov): platforms linked on the client's website are ALWAYS ON (no toggle) — enforced by
--   a check: source 'website' ⇒ state 'on'. Team-added platforms can be switched on / off.
--   Any platform name is allowed (pinterest, youtube…): unsupported ones show "coming later" in the app and
--   are tracked once supported, with no data change.
-- • usage_events: credits / Groq tokens per client (pulls are deleted after 2, so monthly numbers need
--   this). Written by Edge Functions only (service role); the team reads it.
-- • profiles: last client per person (set through set_last_client(); profiles stay admin-only to write).
-- • One running pull across ALL clients (was one per client): free-plan Firecrawl pacing.
-- • client-logos bucket (logos copied in Add client, Slice 17d).

-- ───────────────────────────────────────────── clients: brand + profile
alter table public.clients
  add column website text,
  add column description text,
  add column industry text,
  add column audience text,
  add column country text not null default 'US' check (country ~ '^[A-Z]{2}$'),
  add column language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  add column initials text check (initials is null or char_length(initials) between 1 and 3),
  add column brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column logo_path text,
  add column regulated text[] not null default '{}' check (regulated <@ array[
    'health', 'medical claims', 'weight loss', 'pharma', 'supplements', 'finance', 'alcohol',
    'gambling', 'tobacco', 'cannabis', 'kids', 'legal'
  ]::text[]),
  add column audience_is_kids boolean not null default false,
  add column health_months boolean not null default false,
  -- [{ id, rule, why, quote, source: 'blip' | 'team', added_by?, added_at? }]
  add column content_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(content_rules) = 'array'),
  add column is_demo boolean not null default false,
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles on delete set null,
  add column created_by uuid references public.profiles on delete set null,
  add column profile_scanned_at timestamptz;

comment on column public.clients.brand_color is 'Hex; null = black / white brand → initials on ink';
comment on column public.clients.regulated is 'Regulated topics; code (not the model) derives the content checks from these';
comment on column public.clients.content_rules is 'Blip suggestions (with the quote from the site) + team rules; never enforced silently';

-- ───────────────────────────────────────────── client_platforms
create table public.client_platforms (
  client_id uuid not null references public.clients on delete cascade,
  platform text not null check (platform ~ '^[a-z0-9_-]{1,32}$'),
  state text not null default 'on' check (state in ('on', 'off')),
  source text not null check (source in ('website', 'team')),
  account_url text,
  account_handle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, platform),
  -- Website-linked platforms are always on (lock chip in the app).
  constraint client_platforms_website_always_on check (source = 'team' or state = 'on')
);
create trigger client_platforms_set_updated_at
  before update on public.client_platforms
  for each row execute function public.set_updated_at();

alter table public.client_platforms enable row level security;
grant select, insert, update, delete on public.client_platforms to authenticated;
grant select, insert, update, delete on public.client_platforms to service_role;
create policy "team: full access" on public.client_platforms
  for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));

-- ───────────────────────────────────────────── usage_events (Edge Functions write, team reads)
create table public.usage_events (
  id bigint generated always as identity primary key,
  client_id uuid references public.clients on delete set null,
  client_name text,                              -- kept when the client is deleted
  kind text not null check (kind in ('pull', 'handle_check', 'scan', 'competitor_search', 'groq')),
  provider text not null check (provider in ('firecrawl', 'groq')),
  credits int not null default 0 check (credits >= 0),
  tokens int not null default 0 check (tokens >= 0),
  requests int not null default 1 check (requests >= 0),
  fn text,                                       -- Edge Function that spent it ('pull-task', 'ask-blip'…)
  ref_id uuid,                                   -- e.g. the pull id
  actor uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index usage_events_client_created_idx on public.usage_events (client_id, created_at desc);
create index usage_events_created_idx on public.usage_events (created_at desc);

alter table public.usage_events enable row level security;
grant select on public.usage_events to authenticated;
grant select, insert, update, delete on public.usage_events to service_role;
grant usage on sequence public.usage_events_id_seq to service_role;
create policy "team: read" on public.usage_events
  for select to authenticated using ((select public.is_team()));

-- ───────────────────────────────────────────── profiles: last client
alter table public.profiles
  add column last_client_id uuid references public.clients on delete set null;

-- Only your own row, only this column (profiles stay admin-only for direct updates).
create function public.set_last_client(p_client uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'not_team' using errcode = '42501';
  end if;
  if p_client is not null and not exists (select 1 from public.clients where id = p_client) then
    raise exception 'no_client' using errcode = 'P0002';
  end if;
  update public.profiles set last_client_id = p_client where id = auth.uid();
end;
$$;
revoke execute on function public.set_last_client(uuid) from public, anon;
grant execute on function public.set_last_client(uuid) to authenticated;

-- ───────────────────────────────────────────── one running pull across all clients
drop index if exists public.pulls_one_running_per_client;
create unique index pulls_one_running on public.pulls ((true)) where status = 'running';

-- ───────────────────────────────────────────── client-logos bucket (private, ≤ 200 KB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-logos', 'client-logos', false, 204800,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "team: read client logos" on storage.objects
  for select to authenticated
  using (bucket_id = 'client-logos' and (select public.is_team()));
create policy "team: upload client logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'client-logos' and (select public.is_team()));
create policy "team: update client logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'client-logos' and (select public.is_team()))
  with check (bucket_id = 'client-logos' and (select public.is_team()));
create policy "team: delete client logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'client-logos' and (select public.is_team()));

-- ───────────────────────────────────────────── OBU Health = client #1 (fill the new columns only)
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
