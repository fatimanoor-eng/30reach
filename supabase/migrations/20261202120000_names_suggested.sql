-- Short names backfill (27 Nov 2026): Blip suggests short names / aliases ONCE per client for the client and
-- its competitors that have none (suggest-names, one free Groq call). This marks that it ran, and doubles as
-- the duplicate guard (the function claims it with "where names_suggested_at is null").
alter table public.clients add column if not exists names_suggested_at timestamptz;
comment on column public.clients.names_suggested_at is
  'When Blip suggested short names for this client and its competitors (once).';
