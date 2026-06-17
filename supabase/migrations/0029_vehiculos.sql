-- ============================================================================
-- TrackApp · 0029_vehiculos.sql   (Flota — "varios camiones", Fase A)
--   El autónomo puede tener varios camiones. Un VIAJE FÍSICO lo hace un camión,
--   así que el vehículo se asigna al viaje (viajes.vehiculo_id, opcional).
--   Aditivo: si no hay camiones dados de alta, todo sigue igual.
-- ============================================================================

create table if not exists public.vehiculos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,        -- alias: "Volvo FH", "Camión 1"
  matricula   text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vehiculos_user_idx on public.vehiculos(user_id);

create trigger trg_vehiculos_touch before update on public.vehiculos
  for each row execute function public.touch_updated_at();

alter table public.vehiculos enable row level security;
create policy vehiculos_all on public.vehiculos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Qué camión hizo el viaje. Si se borra el camión, el viaje no se pierde.
alter table public.viajes
  add column if not exists vehiculo_id uuid references public.vehiculos(id) on delete set null;
create index if not exists viajes_vehiculo_idx on public.viajes(vehiculo_id);
