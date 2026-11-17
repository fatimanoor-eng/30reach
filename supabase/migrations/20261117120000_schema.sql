-- 30reach schema (docs/DATA_MODEL.md, incl. Slice 1 spike changes).
-- Row Level Security and grants are in the next migration.
-- Everything client-specific has client_id so more clients can be added later.

-- ───────────────────────────────────────────── people
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- 'OBU Health'
  slug text unique not null,          -- 'obu-health'
  created_at timestamptz not null default now()
);

-- Handles are stored without the leading "@".
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  name text not null,
  initials text not null,
  instagram_handle text,
  tiktok_handle text,
  instagram_status text not null default 'unchecked' check (instagram_status in ('unchecked', 'ok', 'not_found')),
  tiktok_status text not null default 'unchecked' check (tiktok_status in ('unchecked', 'ok', 'not_found')),
  created_at timestamptz not null default now(),
  unique (client_id, name)
);

-- ───────────────────────────────────────────── pulls (keep the last 2 per client)
create table public.pulls (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  started_by uuid references public.profiles on delete set null,
  platforms text[] not null,                    -- {'instagram','tiktok'}
  status text not null default 'running' check (status in ('running', 'done', 'partial', 'failed')),
  credits_estimated int,
  credits_before int,
  credits_used int,
  error_summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index pulls_client_started_idx on public.pulls (client_id, started_at desc);

create table public.pull_tasks (
  id uuid primary key default gen_random_uuid(),
  pull_id uuid not null references public.pulls on delete cascade,
  competitor_id uuid not null references public.competitors on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  error_code text,                              -- e.g. 'not_found' (data.alexandria[0].error.code) → 05g
  posts_found int,
  pages int,                                    -- pages fetched (1 page = 1 provider call)
  credits_used int,                             -- sum of creditsCost; per-brand estimate for 05
  followers int,                                -- follower count at pull time (free in the response)
  finished_at timestamptz
);
create index pull_tasks_pull_idx on public.pull_tasks (pull_id);
create index pull_tasks_competitor_idx on public.pull_tasks (competitor_id);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  pull_id uuid not null references public.pulls on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  competitor_id uuid not null references public.competitors on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok')),
  external_id text not null,                    -- IG shortcode (code) / TikTok aweme_id
  url text not null,
  posted_at timestamptz,
  posted_by text,                               -- IG owner.username / TikTok author.unique_id (spot reposts)
  format text check (format in ('reel', 'carousel', 'image', 'video')),
                                                -- TikTok photo posts → 'carousel' (INTEGRATIONS.md §2a)
  caption text,
  hashtags text[],
  likes int,
  comments int,
  views int,                                    -- null for Instagram images/carousels
  shares int,                                   -- TikTok only
  saves int,                                    -- TikTok only
  counts_hidden boolean not null default false, -- IG like_and_view_counts_disabled: leave out of averages
  is_paid boolean not null default false,
  is_collab boolean not null default false,
  hidden boolean not null default false,        -- team can hide wrong rows (e.g. reposts)
  thumbnail_path text,                          -- Supabase Storage path
  raw jsonb,                                    -- trimmed: only provider fields we don't map (~1–2 KB)
  unique (pull_id, platform, external_id)
);
create index posts_client_pull_idx on public.posts (client_id, pull_id);
create index posts_competitor_posted_idx on public.posts (competitor_id, posted_at desc);

-- ───────────────────────────────────────────── ideas (swipe file)
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  created_by uuid default auth.uid() references public.profiles on delete set null, -- null when made by Blip
  kind text not null check (kind in ('screenshot', 'link', 'note', 'post', 'ai')),
  note text,
  image_path text,
  link_url text,
  source_post_id uuid references public.posts on delete set null,
  source_snapshot jsonb,                        -- brand, date, caption, url kept after old pulls are deleted
  platform text check (platform in ('instagram', 'tiktok')),
  format text,
  tags text[] not null default '{}',
  planned_card_id uuid,                         -- FK added below (circular with calendar_cards)
  created_at timestamptz not null default now()
);
create index ideas_client_created_idx on public.ideas (client_id, created_at desc);
create index ideas_source_post_idx on public.ideas (source_post_id);

create table public.idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas on delete cascade,
  author_id uuid default auth.uid() references public.profiles on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index idea_comments_idea_idx on public.idea_comments (idea_id, created_at);

-- ───────────────────────────────────────────── calendar (planning only — nothing is ever posted)
create table public.calendar_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  date date not null,
  platform text check (platform in ('instagram', 'tiktok')),
  format text,
  title text not null,
  hook text,
  caption text,
  visual_idea text,
  status text not null default 'idea' check (status in ('idea', 'drafting', 'approved', 'posted')),
  origin text not null default 'manual' check (origin in ('manual', 'idea', 'ai')), -- 'ai' shows the AI tag
  idea_id uuid references public.ideas on delete set null,
  compliance_status text check (compliance_status in ('unchecked', 'clear', 'flagged')),
  compliance_notes text,
  created_by uuid default auth.uid() references public.profiles on delete set null,
  updated_at timestamptz not null default now()
);
create index calendar_cards_client_date_idx on public.calendar_cards (client_id, date);
create index calendar_cards_idea_idx on public.calendar_cards (idea_id);

alter table public.ideas
  add constraint ideas_planned_card_fk
  foreign key (planned_card_id) references public.calendar_cards on delete set null;
create index ideas_planned_card_idx on public.ideas (planned_card_id);

-- keep calendar_cards.updated_at current
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger calendar_cards_set_updated_at
  before update on public.calendar_cards
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────── caches / meters (written by Edge Functions only)
create table public.holiday_cache (
  year int not null,
  country text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (year, country)
);

create table public.usage_meters (
  key text primary key,                         -- 'firecrawl' {remaining, plan}, 'groq' {remaining_requests, limit_requests}
  value jsonb not null,
  updated_at timestamptz not null default now()
);
