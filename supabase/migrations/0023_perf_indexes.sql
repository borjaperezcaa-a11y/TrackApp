-- ============================================================================
-- TrackApp · 0023_perf_indexes.sql
-- Índices compuestos (user_id, fecha/emitida_at desc) que cubren el ORDER BY
-- real de los listados. Sin ellos, con muchas filas Postgres ordena en memoria
-- tras filtrar por user_id; con ellos, lee ya ordenado. Barato y sin cambios de
-- comportamiento. (external_invoices ordena en la app, no necesita índice nuevo;
-- system_events ya tiene el suyo en 0019.)
-- ============================================================================

create index if not exists trips_user_fecha_idx
  on public.trips (user_id, fecha desc);

create index if not exists expenses_user_fecha_idx
  on public.expenses (user_id, fecha desc);

create index if not exists incomes_user_fecha_idx
  on public.incomes (user_id, fecha desc);

create index if not exists invoices_user_emitida_idx
  on public.invoices (user_id, emitida_at desc);
