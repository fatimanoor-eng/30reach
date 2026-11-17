-- Row Level Security for 30reach (docs/DATA_MODEL.md › Security).
--
-- Model:
-- • Anonymous (anon role, publishable key without a session): no access to any table.
-- • Signed-in @breakthirty.com users (authenticated + is_team()):
--     full access   → clients, competitors, ideas, idea_comments, calendar_cards
--     read only     → pulls, pull_tasks, holiday_cache, usage_meters (Edge Functions write these)
--     read + hide   → posts (only the `hidden` column can be changed)
--     profiles      → everyone reads; only admins change `role`
-- • Edge Functions use the secret key, which bypasses RLS.

-- ───────────────────────────────────────────── helper functions
create function public.is_team()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@breakthirty.com', false)
$$;

-- security definer: reads profiles without going through profiles' own RLS (avoids recursion).
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_team()
     and exists (
       select 1 from public.profiles
       where id = (select auth.uid()) and role = 'admin'
     )
$$;

revoke execute on function public.is_team(), public.is_admin(), public.set_updated_at() from public, anon;
grant execute on function public.is_team(), public.is_admin() to authenticated;

-- ───────────────────────────────────────────── anonymous: nothing
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- Signed-in users never need these on our tables.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ───────────────────────────────────────────── enable RLS everywhere
alter table public.profiles       enable row level security;
alter table public.clients        enable row level security;
alter table public.competitors    enable row level security;
alter table public.pulls          enable row level security;
alter table public.pull_tasks     enable row level security;
alter table public.posts          enable row level security;
alter table public.ideas          enable row level security;
alter table public.idea_comments  enable row level security;
alter table public.calendar_cards enable row level security;
alter table public.holiday_cache  enable row level security;
alter table public.usage_meters   enable row level security;

-- ───────────────────────────────────────────── full team access
create policy "team: full access" on public.clients
  for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));
create policy "team: full access" on public.competitors
  for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));
create policy "team: full access" on public.ideas
  for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));
create policy "team: full access" on public.idea_comments
  for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));
create policy "team: full access" on public.calendar_cards
  for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));

-- ───────────────────────────────────────────── read only (written by Edge Functions)
revoke insert, update, delete on public.pulls, public.pull_tasks, public.holiday_cache, public.usage_meters
  from authenticated;

create policy "team: read" on public.pulls
  for select to authenticated using ((select public.is_team()));
create policy "team: read" on public.pull_tasks
  for select to authenticated using ((select public.is_team()));
create policy "team: read" on public.holiday_cache
  for select to authenticated using ((select public.is_team()));
create policy "team: read" on public.usage_meters
  for select to authenticated using ((select public.is_team()));

-- ───────────────────────────────────────────── posts: read, and hide/unhide rows
revoke insert, update, delete on public.posts from authenticated;
grant update (hidden) on public.posts to authenticated;

create policy "team: read" on public.posts
  for select to authenticated using ((select public.is_team()));
create policy "team: hide rows" on public.posts
  for update to authenticated using ((select public.is_team())) with check ((select public.is_team()));

-- ───────────────────────────────────────────── profiles: read all, admins change roles
-- Rows are created on first sign-in by a trigger (Slice 3), not by the browser.
revoke insert, update, delete on public.profiles from authenticated;
grant update (role) on public.profiles to authenticated;

create policy "team: read" on public.profiles
  for select to authenticated using ((select public.is_team()));
create policy "admins: change roles" on public.profiles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
