-- ============================================================================
-- TrackApp · 0020_external_serie.sql
-- Las facturas externas se organizan por SERIE con nombre (en vez del fijo
-- cooperativa/otra). La serie se detecta del número (p. ej. "COOP/25-1234" →
-- "COOP") y el usuario le pone un nombre para saber de qué es. La lista se
-- agrupa por serie.
--
-- Se añade la columna `serie` (nombre dado por el usuario). La antigua `fuente`
-- se conserva en la BD para no romper datos, pero la app deja de usarla; se
-- rellena `serie` de las filas existentes a partir de ella.
-- ============================================================================

alter table public.external_invoices add column if not exists serie text;

update public.external_invoices
  set serie = case when fuente = 'cooperativa' then 'Cooperativa' else 'Otras' end
  where serie is null;
