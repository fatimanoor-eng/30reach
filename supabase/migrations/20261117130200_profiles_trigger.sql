-- Profile row on first sign-in (Slice 3).
-- When Supabase Auth creates a user, add their public.profiles row.
-- Role: fatima.noor@breakthirty.com is admin; everyone else is member (admins change roles later).
-- Only @breakthirty.com emails get a profile — a second line of defence if the hook is ever off.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer          -- runs as the owner so it can write profiles (RLS blocks browser inserts)
set search_path = ''
as $$
begin
  if lower(new.email) like '%@breakthirty.com' then
    insert into public.profiles (id, email, full_name, role)
    values (
      new.id,
      lower(new.email),
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
      case when lower(new.email) = 'fatima.noor@breakthirty.com' then 'admin' else 'member' end
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: anyone from the team who already signed in before this migration gets a profile too.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  lower(u.email),
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  case when lower(u.email) = 'fatima.noor@breakthirty.com' then 'admin' else 'member' end
from auth.users u
where lower(u.email) like '%@breakthirty.com'
on conflict (id) do nothing;
