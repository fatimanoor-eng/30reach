-- Usage page fixes (27 Nov 2026). usage_overview() gains:
--   deleted     usage of clients deleted since (rows keep client_name; client_id is set null on delete)
--   unfinished  Add client scans that never became a client (scan id never claimed): runs + credits
--   people      per person (usage_events.actor) this billing month: credits, pulls, scans, checks, Blip
--   weeks rows  + client_name (deleted clients) and unfinished, so the chart can show both
-- "unassigned" no longer includes those. delete-client already keeps usage_events (client_name filled in
-- before the row goes; the FK is "on delete set null"). The actor column existed but was always null until
-- the 27 Nov function fix (userIdOf).

create or replace function public.usage_overview(p_from timestamptz, p_weeks_from timestamptz)
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
        jsonb_build_object('week', w.week, 'client_id', w.client_id, 'client_name', w.client_name,
                           'unfinished', w.unfinished, 'kind', w.kind,
                           'credits', w.credits, 'pulls', w.pulls)
        order by w.week)
      from (
        select
          (date_trunc('week', u.created_at at time zone 'America/New_York'))::date as week,
          u.client_id,
          case when u.client_id is null then u.client_name end as client_name,
          (u.client_id is null and u.client_name is null
            and u.kind in ('scan', 'competitor_search')) as unfinished,
          u.kind,
          sum(u.credits) as credits,
          count(distinct u.ref_id) filter (where u.kind = 'pull') as pulls
        from public.usage_events u
        where u.created_at >= p_weeks_from and u.provider = 'firecrawl' and u.credits > 0
        group by 1, 2, 3, 4, 5
      ) w
    ), '[]'::jsonb),
    -- 27 Nov: a client deleted since keeps its name on its usage rows: one row per name.
    'deleted', coalesce((
      select jsonb_agg(row_to_json(d) order by d.name)
      from (
        select
          u.client_name as name,
          coalesce(sum(u.credits) filter (where u.provider = 'firecrawl'), 0) as credits,
          coalesce(sum(u.credits) filter (where u.kind = 'pull'), 0) as pull_credits,
          coalesce(sum(u.credits) filter (where u.kind = 'handle_check'), 0) as check_credits,
          coalesce(sum(u.credits) filter (where u.kind in ('scan', 'competitor_search')), 0) as scan_credits,
          coalesce(sum(u.requests) filter (where u.provider = 'groq'), 0) as groq_requests,
          count(distinct u.ref_id) filter (where u.kind = 'pull') as pulls
        from public.usage_events u
        where u.created_at >= p_from and u.client_id is null and u.client_name is not null
        group by u.client_name
      ) d
    ), '[]'::jsonb),
    -- 27 Nov: Add client runs that never became a client (their scan id was never claimed).
    'unfinished', (
      select jsonb_build_object(
        'runs', count(distinct u.ref_id),
        'credits', coalesce(sum(u.credits), 0))
      from public.usage_events u
      where u.created_at >= p_from and u.provider = 'firecrawl'
        and u.client_id is null and u.client_name is null
        and u.kind in ('scan', 'competitor_search')
    ),
    'unassigned', coalesce((
      select sum(u.credits) from public.usage_events u
      where u.created_at >= p_from and u.provider = 'firecrawl' and u.client_id is null
        and u.client_name is null and u.kind not in ('scan', 'competitor_search')
    ), 0),
    -- 27 Nov: who triggered what this billing month (actor; null = not recorded, before the fix).
    'people', coalesce((
      select jsonb_agg(row_to_json(p) order by p.credits desc, p.requests desc)
      from (
        select
          u.actor as id,
          pr.full_name,
          pr.email,
          coalesce(sum(u.credits) filter (where u.provider = 'firecrawl'), 0) as credits,
          count(distinct u.ref_id) filter (where u.kind = 'pull') as pulls,
          count(distinct u.ref_id) filter (where u.kind in ('scan', 'competitor_search')) as scans,
          count(*) filter (where u.kind = 'handle_check') as checks,
          coalesce(sum(u.requests) filter (where u.provider = 'groq'), 0) as requests
        from public.usage_events u
        left join public.profiles pr on pr.id = u.actor
        where u.created_at >= p_from
        group by u.actor, pr.full_name, pr.email
      ) p
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.usage_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.usage_overview(timestamptz, timestamptz) to authenticated;
