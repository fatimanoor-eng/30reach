-- Private storage buckets (docs/DATA_MODEL.md › Storage buckets).
--   post-thumbs/{client_id}/{pull_id}/{post_id}.webp  — written by Edge Functions, deleted with old pulls
--   idea-images/{client_id}/{idea_id}.webp            — uploaded by the team, compressed in the browser first
-- 300 KB cap leaves headroom over the ~200 KB compression target (CLAUDE.md rule 8).
-- post-thumbs also accepts JPEG: Instagram sends JPEG; conversion is decided in Slice 5.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('post-thumbs', 'post-thumbs', false, 307200, array['image/webp', 'image/jpeg']),
  ('idea-images', 'idea-images', false, 307200, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Thumbnails: the team can read; only Edge Functions (secret key) write.
create policy "team: read post thumbs" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-thumbs' and (select public.is_team()));

-- Idea images: the team reads, uploads, replaces and deletes.
create policy "team: read idea images" on storage.objects
  for select to authenticated
  using (bucket_id = 'idea-images' and (select public.is_team()));
create policy "team: upload idea images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'idea-images' and (select public.is_team()));
create policy "team: update idea images" on storage.objects
  for update to authenticated
  using (bucket_id = 'idea-images' and (select public.is_team()))
  with check (bucket_id = 'idea-images' and (select public.is_team()));
create policy "team: delete idea images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'idea-images' and (select public.is_team()));
