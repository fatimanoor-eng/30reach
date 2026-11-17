-- "Before User Created" auth hook (Slice 3, CLAUDE.md rule 9).
-- Rejects any sign-up whose email doesn't end in @breakthirty.com — checked server-side by
-- Supabase Auth before the user row is created. The Google `hd` hint is only a convenience.
--
-- Enable after pushing: Dashboard → Authentication → Hooks → Before User Created →
-- type Postgres → schema public → function hook_before_user_created.
--
-- The domain is written here because a Postgres function can't read Edge Function secrets
-- (ALLOWED_EMAIL_DOMAIN). It must always match public.is_team().
--
-- Rejection message format (the app parses it to show the address on screen 02):
--   "<email> isn't a Breakthirty account. 30reach only lets in @breakthirty.com Google accounts."

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  email text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if email like '%@breakthirty.com' then
    return '{}'::jsonb;  -- allow
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message',
        case when email = '' then 'That Google account'
             else email end
        || ' isn''t a Breakthirty account. 30reach only lets in @breakthirty.com Google accounts.'
    )
  );
end;
$$;

-- Only Supabase Auth may run the hook. Not security definer (Supabase's recommendation).
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
