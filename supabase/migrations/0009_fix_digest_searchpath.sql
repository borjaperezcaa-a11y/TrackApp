-- ============================================================================
-- TrackApp · 0009_fix_digest_searchpath.sql
-- En Supabase, pgcrypto (función digest = SHA-256) vive en el esquema
-- `extensions`. La función de emisión tenía search_path = public, así que no
-- encontraba digest() → "function digest(bytea, unknown) does not exist".
--
-- 1) Asegura pgcrypto disponible (no-op si ya existe).
-- 2) Añade `extensions` al search_path de la función (cubre que pgcrypto esté
--    en public o en extensions). Idempotente: se puede ejecutar varias veces.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

alter function public.emit_invoice_from_trips(
  uuid, uuid[], numeric, numeric, date, text, jsonb, jsonb, jsonb
) set search_path = public, extensions;
