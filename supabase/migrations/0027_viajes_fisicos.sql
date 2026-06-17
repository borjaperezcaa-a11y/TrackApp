-- ============================================================================
-- TrackApp · 0027_viajes_fisicos.sql  (Fase 1 — "un viaje contiene varios portes")
--
--   Hasta ahora cada fila de `trips` es un PORTE (cliente + ruta + importe) y se
--   factura por sí sola. Eso NO cambia: la facturación sigue operando sobre `trips`.
--
--   Añadimos por ENCIMA el concepto de VIAJE FÍSICO (el desplazamiento real del
--   camión, con sus km contados UNA sola vez). Un viaje agrupa varios portes:
--   abrir un viaje mostrará todos los portes que se hicieron en él, y los km del
--   viaje no se duplican aunque lleve carga para varios clientes.
--
--   Migración puramente ADITIVA: los portes existentes quedan con viaje_id NULL
--   (sueltos, con sus km propios como hasta ahora). Nada se rompe.
-- ============================================================================

-- ─── VIAJES FÍSICOS ──────────────────────────────────────────────────────────
create table if not exists public.viajes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date not null,
  origen      text,                 -- extremos físicos del desplazamiento
  destino     text,
  km          numeric(10,2),        -- km del viaje: se cuentan UNA vez
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists viajes_user_idx on public.viajes(user_id);

create trigger trg_viajes_touch before update on public.viajes
  for each row execute function public.touch_updated_at();

alter table public.viajes enable row level security;
create policy viajes_all on public.viajes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── VÍNCULO PORTE → VIAJE ───────────────────────────────────────────────────
-- Un porte (fila de trips) puede pertenecer a un viaje físico. Si se borra el
-- viaje, el porte no se pierde: queda suelto (viaje_id = NULL).
alter table public.trips
  add column if not exists viaje_id uuid references public.viajes(id) on delete set null;
create index if not exists trips_viaje_idx on public.trips(viaje_id);
