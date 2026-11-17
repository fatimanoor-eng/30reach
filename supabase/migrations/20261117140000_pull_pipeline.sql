-- Pull pipeline (Slice 5). See docs/INTEGRATIONS.md §3.
-- New table columns are covered by the existing table-level grants (*_grants.sql).

alter table public.pulls
  add column window_days int not null default 30 check (window_days between 1 and 90),
  add column is_test boolean not null default false,       -- test-mode pull: ignored by dashboards + keep-last-2
  add column page_cap int not null default 4 check (page_cap between 1 and 10),
  add column credits_budget int;                           -- hard ceiling for this pull (tasks × page_cap × 2)

-- Only one running pull per client — enforced by the database, not just the UI.
create unique index pulls_one_running_per_client on public.pulls (client_id) where status = 'running';

alter table public.pull_tasks
  add column cursor text,                  -- next page token (IG next_max_id / TikTok max_cursor); null = no more
  add column lease_until timestamptz,      -- a pull-task call "claims" the task until this time (no double pages)
  add column started_at timestamptz;

-- Defaults for counters so pull-task can add to them.
alter table public.pull_tasks
  alter column posts_found set default 0,
  alter column pages set default 0,
  alter column credits_used set default 0;
update public.pull_tasks set posts_found = coalesce(posts_found, 0), pages = coalesce(pages, 0),
  credits_used = coalesce(credits_used, 0);
alter table public.pull_tasks
  alter column posts_found set not null,
  alter column pages set not null,
  alter column credits_used set not null;
