-- ============================================================================
-- TrackApp · 0024_factura_plantilla.sql
-- Estilo de PDF de factura elegido por el usuario: 'trackapp' | 'elegante' | 'moderna'.
-- Solo afecta al diseño del PDF; no toca datos fiscales ni la huella.
-- ============================================================================

alter table public.profiles
  add column if not exists factura_plantilla text not null default 'trackapp';
