-- ============================================================================
-- TrackApp · 0001_schema.sql
-- Esquema base. Cada tabla cuelga de auth.users vía user_id (RLS en 0002).
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid() + digest() (SHA-256)

-- ─── PERFIL / EMISOR (uno por usuario) ──────────────────────────────────────
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  nombre       text,
  nif          text,
  direccion    text,
  cp_localidad text,                       -- ej. "36540 SILLEDA (PONTEVEDRA)"
  iban         text,
  iva_def      numeric(5,2)  not null default 21,
  irpf_def     numeric(5,2)  not null default 1,   -- transporte en módulos
  serie        text          not null default 'FACT',
  contador     int           not null default 0,   -- nº global de facturas emitidas (cadena)
  logo_url     text,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

-- ─── CLIENTES ───────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre           text not null,
  nif              text,
  direccion        text,
  cp_localidad     text,
  condiciones_pago text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists clients_user_idx on public.clients(user_id);

-- ─── FACTURAS (inmutables tras emitir; solo `pagada` es editable) ────────────
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero           text not null,            -- "FACT/25-04"
  serie            text not null,
  anio             smallint not null,        -- año completo, ej. 2025 (la numeración resetea por año)
  num              int  not null,            -- correlativo dentro de (serie, año)
  chain_index      int  not null,            -- posición global en la cadena de huellas del usuario
  client_id        uuid references public.clients(id),
  fecha            date not null,
  forma_pago       text not null default 'Transferencia',
  base             numeric(12,2) not null,
  iva_rate         numeric(5,2)  not null,
  iva              numeric(12,2) not null,
  irpf_rate        numeric(5,2)  not null,
  irpf             numeric(12,2) not null,
  total            numeric(12,2) not null,   -- base + iva - irpf
  prev_hash        text,                     -- huella de la factura anterior (null en la primera)
  huella           text not null,            -- SHA-256 encadenada (mayúsculas hex)
  gen_ts           timestamptz not null,     -- instante de generación (entra en la huella)
  qr               text,                     -- payload de verificación (estructura AEAT, AÚN no oficial)
  emisor_snapshot  jsonb not null,           -- datos del emisor congelados al emitir
  cliente_snapshot jsonb not null,           -- datos del cliente congelados al emitir
  pagada           boolean not null default false,
  emitida_at       timestamptz not null default now(),
  unique (user_id, serie, anio, num),
  unique (user_id, chain_index)
);
create index if not exists invoices_user_idx on public.invoices(user_id);
create index if not exists invoices_client_idx on public.invoices(client_id);

-- ─── LÍNEAS DE FACTURA (la "tabla de portes") ───────────────────────────────
create table if not exists public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  trip_id     uuid,                          -- viaje origen (sin FK dura: el viaje puede borrarse en el futuro)
  fecha       date,
  origen      text,
  destino     text,
  cantidad    numeric(10,2) not null default 1,
  precio      numeric(12,2) not null,
  importe     numeric(12,2) not null,
  orden       int not null default 0
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines(invoice_id);

-- ─── VIAJES ─────────────────────────────────────────────────────────────────
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date not null,
  client_id   uuid references public.clients(id),
  origen      text,                          -- texto libre con CP: "Santiago (15890)"
  destino     text,                          -- "Parma - IT (43122)"
  km          numeric(10,2),
  importe     numeric(12,2) not null,
  estado      text not null default 'pendiente' check (estado in ('pendiente','facturado')),
  invoice_id  uuid references public.invoices(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists trips_user_idx on public.trips(user_id);
create index if not exists trips_client_estado_idx on public.trips(user_id, client_id, estado);

-- ─── GASTOS (MVP+, tabla lista desde ya) ────────────────────────────────────
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria   text,        -- Gasoil | Peaje | Taller | AdBlue | Dieta | Parking | Otro
  base        numeric(12,2),
  iva         numeric(12,2),
  total       numeric(12,2),
  estacion    text,
  fecha       date,
  trip_id     uuid references public.trips(id) on delete set null,
  foto_url    text,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_user_idx on public.expenses(user_id);

-- ─── trigger: crea el perfil al registrarse un usuario ──────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── trigger: updated_at automático ─────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trg_clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger trg_trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();
