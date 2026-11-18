-- Slice 10: idea board ↔ calendar (docs/DATA_MODEL.md, ANNOTATIONS › 14d / 09).
--
-- Both functions are SECURITY INVOKER: they run as the signed-in user, so the normal grants and RLS
-- ("team: full access" on ideas and calendar_cards) still decide what they may touch. They only
-- exist so that two writes happen together or not at all.
-- Execute: authenticated only (not anon, not public).

-- ───────────────────────────────────────────── idea images: WebP or JPEG
-- The browser saves WebP; browsers that can't make WebP from a canvas (older Safari) save JPEG with
-- the same ~200 KB target ({client_id}/{idea_id}.jpg). Size limit unchanged (300 KB).
update storage.buckets
  set allowed_mime_types = array['image/webp', 'image/jpeg']
  where id = 'idea-images';

-- ───────────────────────────────────────────── idea image size (bento tiles)
-- Pixel size of the stored (compressed) image, saved by the browser. The board sizes tiles from it
-- before the image loads: landscape 2×1, portrait/square 1×2. Null = no image, or saved before this.
-- New columns are covered by the existing table-level grants (*_grants.sql).
alter table public.ideas
  add column image_width int check (image_width > 0),
  add column image_height int check (image_height > 0);

-- ───────────────────────────────────────────── one card per idea
-- Belt and braces for "an idea can't be planned twice" (plan_idea checks too, under a row lock).
create unique index calendar_cards_idea_once_idx
  on public.calendar_cards (idea_id)
  where idea_id is not null;

-- ───────────────────────────────────────────── plan_idea (14d "Plan it", drag an idea onto a day)
-- Creates a calendar card (status Idea) linked to the idea, and marks the idea Planned.
-- origin: 'ai' for AI ideas (the card keeps its AI tag), else 'idea'.
-- Errors (message → meaning): idea_not_found · idea_already_planned · title_required
create function public.plan_idea(
  p_idea_id uuid,
  p_date date,
  p_platform text,
  p_format text,
  p_title text
)
returns public.calendar_cards
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_idea public.ideas;
  v_card public.calendar_cards;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'title_required' using errcode = '22023';
  end if;

  -- Lock the idea so two people pressing "Plan it" at once can't both succeed.
  select * into v_idea from public.ideas where id = p_idea_id for update;
  if not found then
    raise exception 'idea_not_found' using errcode = 'P0002';
  end if;
  if v_idea.planned_card_id is not null then
    raise exception 'idea_already_planned' using errcode = 'P0001';
  end if;

  insert into public.calendar_cards (client_id, date, platform, format, title, status, origin, idea_id)
  values (
    v_idea.client_id,
    p_date,
    p_platform,
    p_format,
    btrim(p_title),
    'idea',
    case when v_idea.kind = 'ai' then 'ai' else 'idea' end,
    v_idea.id
  )
  returning * into v_card;

  update public.ideas set planned_card_id = v_card.id where id = v_idea.id;
  return v_card;
end;
$$;

-- ───────────────────────────────────────────── card_to_idea (09 "Move to idea board")
-- • Card made from an idea: the card is deleted and the idea is no longer Planned
--   (ideas.planned_card_id is cleared by its foreign key, on delete set null).
-- • Any other card: its title, hook, caption and visual idea become a Note idea, then the card is
--   deleted.
-- Returns the idea's id (to open it on the board). Errors: card_not_found
create function public.card_to_idea(p_card_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card public.calendar_cards;
  v_idea_id uuid;
begin
  select * into v_card from public.calendar_cards where id = p_card_id for update;
  if not found then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;

  v_idea_id := v_card.idea_id;
  if v_idea_id is null then
    insert into public.ideas (client_id, kind, note, platform, format)
    values (
      v_card.client_id,
      'note',
      concat_ws(
        E'\n\n',
        v_card.title,
        nullif(btrim(v_card.hook), ''),
        nullif(btrim(v_card.caption), ''),
        nullif(btrim(v_card.visual_idea), '')
      ),
      v_card.platform,
      v_card.format
    )
    returning id into v_idea_id;
  end if;

  delete from public.calendar_cards where id = v_card.id;
  return v_idea_id;
end;
$$;

revoke execute on function public.plan_idea(uuid, date, text, text, text) from public, anon;
revoke execute on function public.card_to_idea(uuid) from public, anon;
grant execute on function public.plan_idea(uuid, date, text, text, text) to authenticated;
grant execute on function public.card_to_idea(uuid) to authenticated;
