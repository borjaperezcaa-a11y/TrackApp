-- ============================================================================
-- TrackApp · 0007_security_hardening.sql
-- Resuelve los avisos del Security Advisor de Supabase (los que procede).
--   1) Fija search_path en las funciones de trigger (evita secuestro de search_path).
--   2) Revoca EXECUTE de handle_new_user (es un trigger; nadie debe llamarlo a mano).
--   3) Quita el SELECT público amplio del bucket de logos: las imágenes se siguen
--      sirviendo por su URL pública (bucket public=true), pero ya NO se pueden
--      LISTAR todos los ficheros vía API.
--
-- Nota: que `emit_invoice_from_trips` sea ejecutable por usuarios autenticados es
-- INTENCIONADO (es como se emiten facturas) y seguro (usa auth.uid() + valida
-- propiedad). Ese aviso se deja como está.
-- ============================================================================

-- 1) search_path inmutable en funciones de trigger (no referencian objetos sin
--    cualificar, así que '' es seguro).
alter function public.touch_updated_at() set search_path = '';
alter function public.enforce_invoice_immutable() set search_path = '';

-- 2) handle_new_user: trigger SECURITY DEFINER. Nadie debe poder invocarlo
--    directamente; el trigger sigue funcionando aunque se revoque EXECUTE.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- 3) Logos: quitar el SELECT público (permitía listar todos los ficheros).
--    El bucket es público, así que las URLs públicas (getPublicUrl) siguen
--    funcionando para mostrar el logo en la app y en el PDF.
drop policy if exists logos_read_public on storage.objects;
