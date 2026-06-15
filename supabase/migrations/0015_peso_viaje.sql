-- ============================================================================
-- TrackApp · 0015_peso_viaje.sql
-- Peso de la carga del viaje (numérico) con unidad t/kg. Sirve para métricas de
-- rentabilidad por tonelada-kilómetro (t·km) en las estadísticas del periodo.
-- (No afecta a la factura: la descripción de texto ya viaja a la factura.)
-- ============================================================================

alter table public.trips
  add column if not exists peso        numeric(12,3),
  add column if not exists peso_unidad text not null default 't'
    check (peso_unidad in ('t', 'kg'));
