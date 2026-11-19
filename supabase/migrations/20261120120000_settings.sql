-- Slice 12 Settings (13 / M12): remove access, team roles, usage sizes. DATA_MODEL.md › Settings.
--
-- Remove access = a flag on the profile that is_team() checks. Because every policy, every Storage
-- rule and every Edge Function (requireTeam → rpc is_team) asks is_team(), removing someone takes
-- effect on their very next request, with their current session still open. Signing in again
-- doesn't help: the "before user created" hook only runs on a first sign-up, and is_team() stays
-- false, so the app shows "Your access was removed". Nothing they made is deleted.
--
-- Roles and access change only through two admin functions that serialise team changes and never
-- leave the team without an active admin. Direct updates of profiles.role are no longer allowed.

-- ───────────────────────────────────────────── profiles: removed flag
alter table public.profiles
  add column disabled_at timestamptz,
  add column disabled_by uuid references public.profiles on delete set null;

-- ───────────────────────────────────────────── is_team(): team email AND not removed
-- security definer: reads profiles without going through profiles' own RLS (whose policy calls
-- is_team(), which would recurse). No profile yet (first sign-in) = not removed.
create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@breakthirty.com', false)
     and not exists (
       select 1 from public.profiles
       where id = (select auth.uid()) and disabled_at is not null
     )
$$;
-- (create or replace keeps the existing grants: authenticated only.)

-- ───────────────────────────────────────────── profiles: no direct role edits any more
drop policy "admins: change roles" on public.profiles;
revoke update (role) on public.profiles from authenticated;

-- ───────────────────────────────────────────── team_members() (13 Team card)
-- Everyone who has signed in, with their last sign-in (auth.users is not readable by the team, hence
-- security definer). Active people first (admins, then members, by name), removed people last.
-- Errors: not_team (42501).
create function public.team_members()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  disabled_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'not_team' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.full_name, p.role, p.disabled_at, u.last_sign_in_at, p.created_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    order by (p.disabled_at is not null), p.role, lower(coalesce(p.full_name, p.email));
end;
$$;

-- ───────────────────────────────────────────── set_member_role(person, 'admin' | 'member')
-- Errors: not_admin (42501) · bad_role (22023) · member_not_found (P0002) · member_removed (P0001)
--         · last_admin (P0001: would leave no active admin)
create function public.set_member_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_disabled timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'bad_role' using errcode = '22023';
  end if;
  -- One team change at a time: two admins demoting each other can't both succeed.
  perform pg_advisory_xact_lock(hashtext('30reach:team-changes'));

  select role, disabled_at into v_role, v_disabled from public.profiles where id = p_user;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_disabled is not null then
    raise exception 'member_removed' using errcode = 'P0001';
  end if;
  if v_role = 'admin' and p_role = 'member' and not exists (
    select 1 from public.profiles
    where role = 'admin' and disabled_at is null and id <> p_user
  ) then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;

  update public.profiles set role = p_role where id = p_user;
end;
$$;

-- ───────────────────────────────────────────── set_member_access(person, active)
-- active = false removes access (disabled_at = now()); true restores it.
-- Errors: not_admin (42501) · member_not_found (P0002) · cannot_remove_self (P0001)
--         · last_admin (P0001)
create function public.set_member_access(p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_disabled timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('30reach:team-changes'));

  select role, disabled_at into v_role, v_disabled from public.profiles where id = p_user;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if p_active then
    update public.profiles set disabled_at = null, disabled_by = null where id = p_user;
    return;
  end if;

  if p_user = (select auth.uid()) then
    raise exception 'cannot_remove_self' using errcode = 'P0001';
  end if;
  if v_disabled is not null then
    return; -- already removed
  end if;
  if v_role = 'admin' and not exists (
    select 1 from public.profiles
    where role = 'admin' and disabled_at is null and id <> p_user
  ) then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;

  update public.profiles
  set disabled_at = now(), disabled_by = (select auth.uid())
  where id = p_user;
end;
$$;

-- ───────────────────────────────────────────── usage_sizes() (13 Free-tier usage)
-- Database size (free plan: 500 MB) and Storage used per bucket (free plan: 1 GB in total).
-- SECURITY INVOKER: pg_database_size() only needs CONNECT (which signed-in users have), and the team
-- can already read both buckets' objects, so the sum covers everything without extra rights.
-- Errors: not_team (42501).
create function public.usage_sizes()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception 'not_team' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((
      select jsonb_object_agg(bucket_id, bytes)
      from (
        select bucket_id, sum(coalesce((metadata ->> 'size')::bigint, 0)) as bytes
        from storage.objects
        group by bucket_id
      ) s
    ), '{}'::jsonb)
  );
end;
$$;

-- ───────────────────────────────────────────── execute: signed-in users only
revoke execute on function
  public.team_members(),
  public.set_member_role(uuid, text),
  public.set_member_access(uuid, boolean),
  public.usage_sizes()
from public, anon;
grant execute on function
  public.team_members(),
  public.set_member_role(uuid, text),
  public.set_member_access(uuid, boolean),
  public.usage_sizes()
to authenticated;
