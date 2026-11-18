-- Slice 10: who can delete an idea, and Undo (ANNOTATIONS › 14c).
--
-- The board is shared: everyone on the team can see, add, edit, comment on and plan ideas, but only
-- the person who added an idea, or an admin, can delete it (AI ideas have no person: admins only).
-- The same rule covers the idea's image in Storage.
--
-- Delete and Undo go through two functions so a delete can be put back exactly (row, comments, the
-- link to its calendar card). Both are SECURITY INVOKER: they run as the signed-in user, so the
-- policies below still decide what they may do. Execute: authenticated only.

-- ───────────────────────────────────────────── ideas: split "full access"
drop policy "team: full access" on public.ideas;

create policy "team: read" on public.ideas
  for select to authenticated using ((select public.is_team()));
create policy "team: add" on public.ideas
  for insert to authenticated with check ((select public.is_team()));
create policy "team: edit" on public.ideas
  for update to authenticated
  using ((select public.is_team())) with check ((select public.is_team()));
create policy "creator or admin: delete" on public.ideas
  for delete to authenticated
  using (
    (select public.is_team())
    and (created_by = (select auth.uid()) or (select public.is_admin()))
  );

-- ───────────────────────────────────────────── idea images: same rule for deleting
-- An idea's image is uploaded by the person who adds the idea, so its Storage owner is the idea's
-- creator. (AI ideas' images, if any, are written by Edge Functions: no owner → admins only.)
drop policy "team: delete idea images" on storage.objects;
create policy "creator or admin: delete idea images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'idea-images'
    and (select public.is_team())
    and (owner_id = (select auth.uid())::text or (select public.is_admin()))
  );

-- ───────────────────────────────────────────── delete_idea (14c "Delete idea")
-- Deletes the idea (its comments go with it; a calendar card made from it stays and loses the
-- link) and returns what Undo needs: {"idea": row, "comments": [rows]}. The image is NOT touched
-- here: the browser removes it once Undo is no longer offered.
-- Errors: idea_not_found (P0002) · not_allowed (42501 → HTTP 403: not the creator or an admin)
create function public.delete_idea(p_idea_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_idea public.ideas;
  v_comments jsonb;
  v_deleted int;
begin
  select * into v_idea from public.ideas where id = p_idea_id for update;
  if not found then
    raise exception 'idea_not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) into v_comments
  from public.idea_comments c
  where c.idea_id = p_idea_id;

  delete from public.ideas where id = p_idea_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    -- RLS hid the row from DELETE: the team can see it but this person may not delete it.
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return jsonb_build_object('idea', to_jsonb(v_idea), 'comments', v_comments);
end;
$$;

-- ───────────────────────────────────────────── restore_idea (the toast's "Undo")
-- Puts back what delete_idea returned: the same row (same id, creator, date), its comments, and the
-- two-way link to its calendar card if that card still exists. Returns the idea's id.
create function public.restore_idea(p_snapshot jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_idea public.ideas;
begin
  v_idea := jsonb_populate_record(null::public.ideas, p_snapshot -> 'idea');
  if v_idea.id is null then
    raise exception 'snapshot_invalid' using errcode = '22023';
  end if;

  -- The card it was planned on may have been deleted meanwhile: then it's just not planned.
  if v_idea.planned_card_id is not null
     and not exists (select 1 from public.calendar_cards where id = v_idea.planned_card_id) then
    v_idea.planned_card_id := null;
  end if;

  insert into public.ideas select (v_idea).*;

  insert into public.idea_comments
  select * from jsonb_populate_recordset(null::public.idea_comments, p_snapshot -> 'comments');

  if v_idea.planned_card_id is not null then
    update public.calendar_cards
      set idea_id = v_idea.id
      where id = v_idea.planned_card_id and idea_id is null;
  end if;

  return v_idea.id;
end;
$$;

revoke execute on function public.delete_idea(uuid) from public, anon;
revoke execute on function public.restore_idea(jsonb) from public, anon;
grant execute on function public.delete_idea(uuid) to authenticated;
grant execute on function public.restore_idea(jsonb) to authenticated;
