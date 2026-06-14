-- ============================================================================
-- TrackApp · 0009_fix_digest_searchpath.sql
-- En Supabase, pgcrypto (función digest = SHA-256) se instala en el esquema
-- `extensions`. La función de emisión tenía search_path = public, así que no
-- encontraba digest() → "function digest(bytea, unknown) does not exist".
-- Añadimos `extensions` al search_path (sin reescribir el cuerpo).
-- ============================================================================

alter function public.emit_invoice_from_trips(
  uuid, uuid[], numeric, numeric, date, text, jsonb, jsonb, jsonb
) set search_path = public, extensions;
