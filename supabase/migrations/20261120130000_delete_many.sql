-- Slice 12 additions: delete many ideas (idea board "Select" mode) with Undo, and "Delete all ideas"
-- (Settings › Data, admins). DATA_MODEL.md › Slice 12.
--
-- delete_ideas / restore_ideas are SECURITY INVOKER, like delete_idea / restore_idea (Slice 10):
-- the "creator or admin: delete" policy decides which ideas actually go. Ideas the caller may not
-- delete are skipped (and counted), never deleted. Comments go with their idea (cascade); a calendar
-- card made from an idea stays and loses the link (calendar_cards.idea_id … on delete set null).
-- Images are not touched here: the browser removes them once Undo is no longer offered
-- (pending-image-deletes.ts), with the same creator-or-admin Storage rule.

-- ───────────────────────────────────────────── delete_ideas(ids) → { deleted: [snapshots], skipped }
-- Each snapshot is what delete_idea returns ({ idea, comments }), so restore_ideas can put it back.
-- Errors: not_team (42501) · too_many (22023, more than 500 at once)
create function public.delete_ideas(p_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted jsonb;
  v_skipped int;
begin
  if not public.is_team() then
    raise exception 'not_team' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('deleted', '[]'::jsonb, 'skipped', 0);
  end if;
  if array_length(p_ids, 1) > 500 then
    raise exception 'too_many' using errcode = '22023';
  end if;

  -- One statement: the snapshots are read before the delete (same snapshot), then RLS's delete
  -- policy filters which rows the DELETE removes; only those snapshots are returned.
  with snaps as (
    select
      i.id,
      jsonb_build_object(
        'idea', to_jsonb(i),
        'comments', coalesce((
          select jsonb_agg(to_jsonb(c) order by c.created_at)
          from public.idea_comments c
          where c.idea_id = i.id
        ), '[]'::jsonb)
      ) as snap
    from public.ideas i
    where i.id = any(p_ids)
  ),
  gone as (
    delete from public.ideas where id in (select id from snaps) returning id
  )
  select
    coalesce(jsonb_agg(s.snap) filter (where g.id is not null), '[]'::jsonb),
    count(*) filter (where g.id is null)
  into v_deleted, v_skipped
  from snaps s
  left join gone g on g.id = s.id;

  return jsonb_build_object('deleted', v_deleted, 'skipped', v_skipped);
end;
$$;

-- ───────────────────────────────────────────── restore_ideas(snapshots) → how many came back
-- Undo for delete_ideas: restore_idea for each snapshot, in one transaction (all or nothing).
create function public.restore_ideas(p_snapshots jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snap jsonb;
  v_count int := 0;
begin
  if jsonb_typeof(p_snapshots) is distinct from 'array' then
    raise exception 'snapshot_invalid' using errcode = '22023';
  end if;
  for v_snap in select value from jsonb_array_elements(p_snapshots) loop
    perform public.restore_idea(v_snap);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ───────────────────────────────────────────── delete_all_ideas(client, expected) (admins)
-- Settings › Data › "Delete all ideas": the admin types the number of ideas; if the board changed
-- since (someone added or deleted one), nothing happens. Returns { deleted, image_paths } so the
-- browser can remove the images. No Undo.
-- Errors: not_admin (42501) · count_changed (P0001, with the current count in DETAIL)
create function public.delete_all_ideas(p_client uuid, p_expected int)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
  v_paths jsonb;
  v_deleted int;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  -- Lock the board's rows so the count can't change between the check and the delete.
  perform 1 from public.ideas where client_id = p_client for update;
  select count(*), coalesce(jsonb_agg(image_path) filter (where image_path is not null), '[]'::jsonb)
  into v_count, v_paths
  from public.ideas
  where client_id = p_client;
  if v_count is distinct from p_expected then
    raise exception 'count_changed' using errcode = 'P0001', detail = v_count::text;
  end if;

  delete from public.ideas where client_id = p_client;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('deleted', v_deleted, 'image_paths', v_paths);
end;
$$;

-- ───────────────────────────────────────────── execute: signed-in users only
revoke execute on function
  public.delete_ideas(uuid[]),
  public.restore_ideas(jsonb),
  public.delete_all_ideas(uuid, int)
from public, anon;
grant execute on function
  public.delete_ideas(uuid[]),
  public.restore_ideas(jsonb),
  public.delete_all_ideas(uuid, int)
to authenticated;
