-- ============================================================================
-- TrackApp · 0005_storage_recibos.sql
-- Bucket PRIVADO para las fotos de tickets de gasto (dato personal/financiero,
-- RGPD). A diferencia de los logos, NO es público: solo el dueño accede a su
-- carpeta recibos/{user_id}/...  Para mostrarlos se usan URLs firmadas.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recibos', 'recibos', false, 8388608,  -- 8 MB, privado
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

drop policy if exists recibos_select_own on storage.objects;
create policy recibos_select_own on storage.objects
  for select using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_insert_own on storage.objects;
create policy recibos_insert_own on storage.objects
  for insert with check (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_update_own on storage.objects;
create policy recibos_update_own on storage.objects
  for update using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_delete_own on storage.objects;
create policy recibos_delete_own on storage.objects
  for delete using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );
