-- Slice 17f — Usage page (Figma 17 / M20). One read-only function for the per-client table and the
-- weekly credits chart. See docs/BUILD_PLAN.md › Slice 17, docs/DATA_MODEL.md.
--
-- usage_overview(p_from, p_weeks_from) → jsonb
--   clients:  one row per client (archived too): Firecrawl credits since p_from by kind (pull, handle
--             check, scan / competitor search), Groq requests, pulls since p_from, last saved pull, storage
--             bytes under `{client}/` (+ a scanned logo), current posts / ideas / calendar cards.
--   weeks:    credits per client, week (Monday, US Eastern) and kind since p_weeks_from (+ pulls), for the
--             stacked chart and its tooltip ("1 pull (64) + scan (11)").
--   unassigned: credits since p_from with no client (a client deleted since keeps its name in
--             usage_events, so those appear with client_id null and their name).
-- Security invoker: it reads through the caller's RLS (team only), like usage_sizes().

create function public.usage_overview(p_from timestamptz, p_weeks_from timestamptz)
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
    'clients', coalesce((
      select jsonb_agg(row_to_json(c) order by c.name)
      from (
        select
          cl.id,
          cl.slug,
          cl.name,
          cl.initials,
          cl.brand_color,
          cl.is_demo,
          cl.archived_at,
          coalesce(e.credits, 0) as credits,
          coalesce(e.pull_credits, 0) as pull_credits,
          coalesce(e.check_credits, 0) as check_credits,
          coalesce(e.scan_credits, 0) as scan_credits,
          coalesce(e.groq_requests, 0) as groq_requests,
          coalesce(e.pulls, 0) as pulls,
          (select max(p.started_at) from public.pulls p
            where p.client_id = cl.id and not p.is_test and p.status in ('done', 'partial')) as last_pull,
          coalesce((
            select sum(coalesce((o.metadata ->> 'size')::bigint, 0))
            from storage.objects o
            where o.bucket_id in ('post-thumbs', 'idea-images', 'client-logos')
              and (o.name like cl.id::text || '/%' or o.name = cl.logo_path)
          ), 0) as storage_bytes,
          (select count(*) from public.posts x where x.client_id = cl.id) as posts,
          (select count(*) from public.ideas x where x.client_id = cl.id) as ideas,
          (select count(*) from public.calendar_cards x where x.client_id = cl.id) as cards
        from public.clients cl
        left join (
          select
            u.client_id,
            sum(u.credits) filter (where u.provider = 'firecrawl') as credits,
            sum(u.credits) filter (where u.kind = 'pull') as pull_credits,
            sum(u.credits) filter (where u.kind = 'handle_check') as check_credits,
            sum(u.credits) filter (where u.kind in ('scan', 'competitor_search')) as scan_credits,
            sum(u.requests) filter (where u.provider = 'groq') as groq_requests,
            count(distinct u.ref_id) filter (where u.kind = 'pull') as pulls
          from public.usage_events u
          where u.created_at >= p_from
          group by u.client_id
        ) e on e.client_id = cl.id
      ) c
    ), '[]'::jsonb),
    'weeks', coalesce((
      select jsonb_agg(
        jsonb_build_object('week', w.week, 'client_id', w.client_id, 'kind', w.kind,
                           'credits', w.credits, 'pulls', w.pulls)
        order by w.week)
      from (
        select
          (date_trunc('week', u.created_at at time zone 'America/New_York'))::date as week,
          u.client_id,
          u.kind,
          sum(u.credits) as credits,
          count(distinct u.ref_id) filter (where u.kind = 'pull') as pulls
        from public.usage_events u
        where u.created_at >= p_weeks_from and u.provider = 'firecrawl' and u.credits > 0
        group by 1, 2, 3
      ) w
    ), '[]'::jsonb),
    'unassigned', coalesce((
      select sum(u.credits) from public.usage_events u
      where u.created_at >= p_from and u.provider = 'firecrawl' and u.client_id is null
    ), 0)
  );
end;
$$;

revoke execute on function public.usage_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.usage_overview(timestamptz, timestamptz) to authenticated;

-- ───────────────────────────────────────────── Add client: scans count toward the new client
-- scan-site / suggest-competitors run before the client exists, so their usage rows have no client;
-- each Add client run tags them with one scan id (usage_events.ref_id). Creating the client claims them.
-- Only those kinds, only rows not claimed yet; usage_events stay write-protected otherwise.
create function public.claim_scan_usage(p_scan uuid, p_client uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_team() then
    raise exception 'not_team' using errcode = '42501';
  end if;
  update public.usage_events u
  set client_id = c.id, client_name = c.name
  from public.clients c
  where c.id = p_client
    and u.ref_id = p_scan
    and u.client_id is null
    and u.kind in ('scan', 'competitor_search');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.claim_scan_usage(uuid, uuid) from public, anon;
grant execute on function public.claim_scan_usage(uuid, uuid) to authenticated;
