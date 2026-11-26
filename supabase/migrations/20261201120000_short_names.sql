-- Short names and aliases (27 Nov 2026): long names ("Faculty of Computing & Information Technology",
-- "National University of Sciences and Technology") cut off in chips, tables and the pull dialog.
--   short_name  what people call it, shown where space is tight (e.g. "NUST", "BNU"); null = the name
--   aliases     other names for the same brand (e.g. {PUCIT, FCIT}); Blip treats them as that brand
-- Suggested by the website scan / Groq, editable in Client settings and the competitor panel.
-- RLS on clients and competitors already covers these columns.

alter table public.clients
  add column if not exists short_name text check (short_name is null or char_length(short_name) between 1 and 24),
  add column if not exists aliases text[] not null default '{}'
    check (cardinality(aliases) <= 8);

alter table public.competitors
  add column if not exists short_name text check (short_name is null or char_length(short_name) between 1 and 24),
  add column if not exists aliases text[] not null default '{}'
    check (cardinality(aliases) <= 8);

comment on column public.clients.short_name is 'Shown where space is tight; null = name (27 Nov 2026).';
comment on column public.clients.aliases is 'Other names for the client; Blip treats them as the client.';
comment on column public.competitors.short_name is 'Shown where space is tight; null = name (27 Nov 2026).';
comment on column public.competitors.aliases is 'Other names for this brand; Blip treats them as it.';
