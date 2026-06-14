-- ============================================================================
-- TrackApp · 0004_storage.sql
-- Bucket para el logo del emisor (se imprime en la factura).
-- Lectura pública (el logo no es secreto y debe verse en el PDF), pero
-- escritura/borrado SOLO en la carpeta del propio usuario: logos/{user_id}/...
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos', 'logos', true, 2097152,  -- 2 MB
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists logos_read_public on storage.objects;
create policy logos_read_public on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists logos_insert_own on storage.objects;
create policy logos_insert_own on storage.objects
  for insert with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_update_own on storage.objects;
create policy logos_update_own on storage.objects
  for update using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_delete_own on storage.objects;
create policy logos_delete_own on storage.objects
  for delete using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );
