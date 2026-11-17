-- Table privileges (Slice 3).
-- "Automatically expose new tables" is OFF in the Data API settings, so no role gets table access
-- unless it is granted here. This file is the source of truth for grants; RLS policies
-- (20261117120100_rls.sql) then decide which ROWS each role sees.
--
-- ⚠ Every new table needs its grants added in a migration, or the API can't see it.

-- ───────────────────────────────────────────── anon: nothing (unchanged)
revoke all on all tables in schema public from anon;

-- ───────────────────────────────────────────── authenticated (signed-in users; RLS checks is_team())
grant usage on schema public to authenticated;

-- full access
grant select, insert, update, delete
  on public.clients, public.competitors, public.ideas, public.idea_comments, public.calendar_cards
  to authenticated;

-- read only (Edge Functions write these)
grant select
  on public.pulls, public.pull_tasks, public.holiday_cache, public.usage_meters
  to authenticated;

-- posts: read, and hide/unhide rows only
grant select on public.posts to authenticated;
grant update (hidden) on public.posts to authenticated;

-- profiles: read, and admins change roles (RLS limits updates to is_admin())
grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;

-- ───────────────────────────────────────────── service_role (secret key, Edge Functions only)
-- The secret key bypasses RLS, but still needs table privileges.
grant usage on schema public to service_role;
grant select, insert, update, delete
  on public.profiles, public.clients, public.competitors, public.pulls, public.pull_tasks,
     public.posts, public.ideas, public.idea_comments, public.calendar_cards,
     public.holiday_cache, public.usage_meters
  to service_role;
