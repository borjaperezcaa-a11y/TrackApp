-- ============================================================================
-- TrackApp - ESQUEMA COMPLETO Y RE-EJECUTABLE (migraciones 0001..0022)
-- Idempotente: anade 'drop ... if exists' antes de cada trigger/policy, asi se
-- puede ejecutar sobre una BD vacia, a medias o ya existente sin romper.
-- Uso: Supabase > SQL Editor > New query > pega TODO > Run.
-- ============================================================================

-- ####################################################################
-- ##### 0001_schema.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0001_schema.sql
-- Esquema base. Cada tabla cuelga de auth.users vÃ­a user_id (RLS en 0002).
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid() + digest() (SHA-256)

-- â”€â”€â”€ PERFIL / EMISOR (uno por usuario) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  nombre       text,
  nif          text,
  direccion    text,
  cp_localidad text,                       -- ej. "36540 SILLEDA (PONTEVEDRA)"
  iban         text,
  iva_def      numeric(5,2)  not null default 21,
  irpf_def     numeric(5,2)  not null default 1,   -- transporte en mÃ³dulos
  serie        text          not null default 'FACT',
  contador     int           not null default 0,   -- nÂº global de facturas emitidas (cadena)
  logo_url     text,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

-- â”€â”€â”€ CLIENTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ FACTURAS (inmutables tras emitir; solo `pagada` es editable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero           text not null,            -- "FACT/25-04"
  serie            text not null,
  anio             smallint not null,        -- aÃ±o completo, ej. 2025 (la numeraciÃ³n resetea por aÃ±o)
  num              int  not null,            -- correlativo dentro de (serie, aÃ±o)
  chain_index      int  not null,            -- posiciÃ³n global en la cadena de huellas del usuario
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
  huella           text not null,            -- SHA-256 encadenada (mayÃºsculas hex)
  gen_ts           timestamptz not null,     -- instante de generaciÃ³n (entra en la huella)
  qr               text,                     -- payload de verificaciÃ³n (estructura AEAT, AÃšN no oficial)
  emisor_snapshot  jsonb not null,           -- datos del emisor congelados al emitir
  cliente_snapshot jsonb not null,           -- datos del cliente congelados al emitir
  pagada           boolean not null default false,
  emitida_at       timestamptz not null default now(),
  unique (user_id, serie, anio, num),
  unique (user_id, chain_index)
);
create index if not exists invoices_user_idx on public.invoices(user_id);
create index if not exists invoices_client_idx on public.invoices(client_id);

-- â”€â”€â”€ LÃNEAS DE FACTURA (la "tabla de portes") â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ VIAJES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ GASTOS (MVP+, tabla lista desde ya) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ trigger: crea el perfil al registrarse un usuario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- â”€â”€â”€ trigger: updated_at automÃ¡tico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_clients_touch on public.clients;
create trigger trg_clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_trips_touch on public.trips;
create trigger trg_trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();


-- ####################################################################
-- ##### 0002_rls.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0002_rls.sql
-- Row-Level Security en TODAS las tablas: cada usuario solo ve/toca SUS datos.
-- Innegociable (secciÃ³n 7 del brief).
-- ============================================================================

alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.trips         enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.expenses      enable row level security;

-- â”€â”€â”€ PROFILES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (user_id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- insert lo hace el trigger handle_new_user (security definer); no hace falta policy.

-- â”€â”€â”€ CLIENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists clients_all on public.clients;
create policy clients_all on public.clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- â”€â”€â”€ TRIPS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists trips_all on public.trips;
create policy trips_all on public.trips
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- â”€â”€â”€ EXPENSES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- â”€â”€â”€ INVOICES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Lectura: las propias. InserciÃ³n: SOLO vÃ­a emit_invoice_from_trips() (definer).
-- ActualizaciÃ³n: permitida pero un trigger limita los cambios a `pagada`.
-- Borrado: prohibido (factura emitida = inmutable).
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (user_id = auth.uid());
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- â”€â”€â”€ INVOICE_LINES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Solo lectura para el cliente; las escribe la funciÃ³n de emisiÃ³n.
drop policy if exists invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines
  for select using (user_id = auth.uid());

-- â”€â”€â”€ Inmutabilidad de facturas: solo `pagada` puede cambiar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.enforce_invoice_immutable()
returns trigger language plpgsql as $$
begin
  if  new.numero            is distinct from old.numero
   or new.serie             is distinct from old.serie
   or new.anio              is distinct from old.anio
   or new.num               is distinct from old.num
   or new.chain_index       is distinct from old.chain_index
   or new.client_id         is distinct from old.client_id
   or new.fecha             is distinct from old.fecha
   or new.base              is distinct from old.base
   or new.iva_rate          is distinct from old.iva_rate
   or new.iva               is distinct from old.iva
   or new.irpf_rate         is distinct from old.irpf_rate
   or new.irpf              is distinct from old.irpf
   or new.total             is distinct from old.total
   or new.prev_hash         is distinct from old.prev_hash
   or new.huella            is distinct from old.huella
   or new.gen_ts            is distinct from old.gen_ts
   or new.emisor_snapshot   is distinct from old.emisor_snapshot
   or new.cliente_snapshot  is distinct from old.cliente_snapshot
  then
    raise exception 'Una factura emitida es inmutable: solo puede cambiar el estado de pago.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_immutable on public.invoices;
create trigger trg_invoices_immutable
  before update on public.invoices
  for each row execute function public.enforce_invoice_immutable();


-- ####################################################################
-- ##### 0003_emit_invoice.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0003_emit_invoice.sql
-- EmisiÃ³n ATÃ“MICA de factura a partir de viajes. Todo en una transacciÃ³n con
-- lock del perfil â†’ numeraciÃ³n y cadena de huellas sin colisiones.
--
-- Huella canÃ³nica (idÃ©ntica a lib/verifactu/canonical.ts):
--   IDEmisorFactura={nif}&NumSerieFactura={numero}&FechaExpedicionFactura={DD-MM-YYYY}
--   &TipoFactura=F1&CuotaTotal={iva}&ImporteTotal={total}&Huella={prev}
--   &FechaHoraHusoGenRegistro={ISO8601 UTC con Z}   â†’ SHA-256 â†’ hex MAYÃšSCULAS
--
-- AVISO: motor NO certificado. No envÃ­a a la AEAT ni firma con certificado.
-- ============================================================================

create or replace function public.emit_invoice_from_trips(
  p_client_id  uuid,
  p_trip_ids   uuid[],
  p_iva_rate   numeric default null,
  p_irpf_rate  numeric default null,
  p_fecha      date    default current_date,
  p_forma_pago text    default 'Transferencia',
  p_lines      jsonb   default null,   -- override editable: [{trip_id,fecha,origen,destino,cantidad,precio}]
  p_emisor     jsonb   default null,   -- override editable del emisor
  p_cliente    jsonb   default null    -- override editable del cliente
) returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_client    public.clients;
  v_serie     text;
  v_anio      smallint := extract(year from p_fecha)::smallint;
  v_yy        text;
  v_num       int;
  v_chain     int;
  v_prev_hash text;
  v_iva_rate  numeric;
  v_irpf_rate numeric;
  v_base      numeric(12,2);
  v_iva       numeric(12,2);
  v_irpf      numeric(12,2);
  v_total     numeric(12,2);
  v_numero    text;
  v_gen_ts    timestamptz := now();
  v_gen_iso   text;
  v_emisor    jsonb;
  v_cliente   jsonb;
  v_huella    text;
  v_canonical text;
  v_qr        text;
  v_invoice   public.invoices;
  v_line      jsonb;
  v_orden     int := 0;
  v_lines     jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- Lock del perfil â†’ serializa la emisiÃ³n por usuario.
  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  if p_trip_ids is null or array_length(p_trip_ids, 1) is null then
    raise exception 'No hay viajes seleccionados';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_uid;
  if not found then
    raise exception 'Cliente no vÃ¡lido';
  end if;

  v_serie     := coalesce(v_profile.serie, 'FACT');
  v_iva_rate  := coalesce(p_iva_rate,  v_profile.iva_def,  21);
  v_irpf_rate := coalesce(p_irpf_rate, v_profile.irpf_def, 1);

  -- Validar viajes: existen, son del usuario, estÃ¡n pendientes y son del cliente.
  if exists (
    select 1
    from unnest(p_trip_ids) as tid
    left join public.trips t on t.id = tid and t.user_id = v_uid
    where t.id is null
       or t.estado <> 'pendiente'
       or t.client_id is distinct from p_client_id
  ) then
    raise exception 'AlgÃºn viaje no es vÃ¡lido (inexistente, ya facturado o de otro cliente)';
  end if;

  -- LÃ­neas: override del usuario o derivadas de los viajes (cantidad 1, precio=importe).
  if p_lines is not null then
    v_lines := p_lines;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
              'trip_id',  t.id,
              'fecha',    t.fecha,
              'origen',   t.origen,
              'destino',  t.destino,
              'cantidad', 1,
              'precio',   t.importe
            ) order by t.fecha, t.created_at), '[]'::jsonb)
      into v_lines
      from public.trips t
      where t.id = any(p_trip_ids) and t.user_id = v_uid;
  end if;

  -- NumeraciÃ³n por aÃ±o + posiciÃ³n global en la cadena (todo bajo el lock).
  select coalesce(max(num), 0) + 1 into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;

  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));

  -- Importes
  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_base from jsonb_array_elements(v_lines) l;
  v_base  := round(v_base, 2);
  v_iva   := round(v_base * v_iva_rate  / 100, 2);
  v_irpf  := round(v_base * v_irpf_rate / 100, 2);
  v_total := v_base + v_iva - v_irpf;

  -- Snapshots inmutables (editables por override)
  v_emisor := coalesce(p_emisor, jsonb_build_object(
    'nombre', v_profile.nombre, 'nif', v_profile.nif, 'direccion', v_profile.direccion,
    'cp_localidad', v_profile.cp_localidad, 'iban', v_profile.iban, 'logo_url', v_profile.logo_url,
    'serie', v_serie));
  v_cliente := coalesce(p_cliente, jsonb_build_object(
    'nombre', v_client.nombre, 'nif', v_client.nif, 'direccion', v_client.direccion,
    'cp_localidad', v_client.cp_localidad, 'condiciones_pago', v_client.condiciones_pago));

  -- Huella encadenada
  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || coalesce(v_emisor->>'nif', '') ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(p_fecha, 'DD-MM-YYYY') ||
       '&TipoFactura=F1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || coalesce(v_emisor->>'nif', '') ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(p_fecha, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, p_client_id, p_fecha, p_forma_pago,
    v_base, v_iva_rate, v_iva, v_irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_emisor, v_cliente)
  returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.invoice_lines (
      user_id, invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe, orden)
    values (
      v_uid, v_invoice.id,
      nullif(v_line->>'trip_id', '')::uuid,
      nullif(v_line->>'fecha', '')::date,
      v_line->>'origen', v_line->>'destino',
      coalesce((v_line->>'cantidad')::numeric, 1),
      (v_line->>'precio')::numeric,
      round(coalesce((v_line->>'cantidad')::numeric, 1) * (v_line->>'precio')::numeric, 2),
      v_orden);
    v_orden := v_orden + 1;
  end loop;

  update public.trips set estado = 'facturado', invoice_id = v_invoice.id
    where id = any(p_trip_ids) and user_id = v_uid;

  update public.profiles set contador = v_chain where user_id = v_uid;

  return v_invoice;
end;
$$;

revoke all on function public.emit_invoice_from_trips(uuid, uuid[], numeric, numeric, date, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.emit_invoice_from_trips(uuid, uuid[], numeric, numeric, date, text, jsonb, jsonb, jsonb) to authenticated;


-- ####################################################################
-- ##### 0004_storage.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0004_storage.sql
-- Bucket para el logo del emisor (se imprime en la factura).
-- Lectura pÃºblica (el logo no es secreto y debe verse en el PDF), pero
-- escritura/borrado SOLO en la carpeta del propio usuario: logos/{user_id}/...
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos', 'logos', true, 2097152,  -- 2 MB
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists logos_read_public on storage.objects;
drop policy if exists logos_read_public on storage.objects;
create policy logos_read_public on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists logos_insert_own on storage.objects;
drop policy if exists logos_insert_own on storage.objects;
create policy logos_insert_own on storage.objects
  for insert with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_update_own on storage.objects;
drop policy if exists logos_update_own on storage.objects;
create policy logos_update_own on storage.objects
  for update using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_delete_own on storage.objects;
drop policy if exists logos_delete_own on storage.objects;
create policy logos_delete_own on storage.objects
  for delete using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ####################################################################
-- ##### 0005_storage_recibos.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0005_storage_recibos.sql
-- Bucket PRIVADO para las fotos de tickets de gasto (dato personal/financiero,
-- RGPD). A diferencia de los logos, NO es pÃºblico: solo el dueÃ±o accede a su
-- carpeta recibos/{user_id}/...  Para mostrarlos se usan URLs firmadas.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recibos', 'recibos', false, 8388608,  -- 8 MB, privado
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

drop policy if exists recibos_select_own on storage.objects;
drop policy if exists recibos_select_own on storage.objects;
create policy recibos_select_own on storage.objects
  for select using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_insert_own on storage.objects;
drop policy if exists recibos_insert_own on storage.objects;
create policy recibos_insert_own on storage.objects
  for insert with check (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_update_own on storage.objects;
drop policy if exists recibos_update_own on storage.objects;
create policy recibos_update_own on storage.objects
  for update using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_delete_own on storage.objects;
drop policy if exists recibos_delete_own on storage.objects;
create policy recibos_delete_own on storage.objects
  for delete using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ####################################################################
-- ##### 0006_emit_requires_emisor.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0006_emit_requires_emisor.sql
-- Reemplaza emit_invoice_from_trips para EXIGIR que el emisor tenga identidad
-- (nombre + NIF) antes de emitir. Cada camionero debe registrar sus datos en
-- "Mis datos"; una factura sin emisor identificado no es vÃ¡lida.
-- (create or replace: aplica sobre la funciÃ³n de 0003 sin perder nada.)
-- ============================================================================

create or replace function public.emit_invoice_from_trips(
  p_client_id  uuid,
  p_trip_ids   uuid[],
  p_iva_rate   numeric default null,
  p_irpf_rate  numeric default null,
  p_fecha      date    default current_date,
  p_forma_pago text    default 'Transferencia',
  p_lines      jsonb   default null,
  p_emisor     jsonb   default null,
  p_cliente    jsonb   default null
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions  -- extensions: pgcrypto.digest (SHA-256)
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_client    public.clients;
  v_serie     text;
  v_anio      smallint := extract(year from p_fecha)::smallint;
  v_yy        text;
  v_num       int;
  v_chain     int;
  v_prev_hash text;
  v_iva_rate  numeric;
  v_irpf_rate numeric;
  v_base      numeric(12,2);
  v_iva       numeric(12,2);
  v_irpf      numeric(12,2);
  v_total     numeric(12,2);
  v_numero    text;
  v_gen_ts    timestamptz := now();
  v_gen_iso   text;
  v_emisor    jsonb;
  v_cliente   jsonb;
  v_huella    text;
  v_canonical text;
  v_qr        text;
  v_invoice   public.invoices;
  v_line      jsonb;
  v_orden     int := 0;
  v_lines     jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  if p_trip_ids is null or array_length(p_trip_ids, 1) is null then
    raise exception 'No hay viajes seleccionados';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_uid;
  if not found then
    raise exception 'Cliente no vÃ¡lido';
  end if;

  v_serie     := coalesce(v_profile.serie, 'FACT');
  v_iva_rate  := coalesce(p_iva_rate,  v_profile.iva_def,  21);
  v_irpf_rate := coalesce(p_irpf_rate, v_profile.irpf_def, 1);

  if exists (
    select 1
    from unnest(p_trip_ids) as tid
    left join public.trips t on t.id = tid and t.user_id = v_uid
    where t.id is null
       or t.estado <> 'pendiente'
       or t.client_id is distinct from p_client_id
  ) then
    raise exception 'AlgÃºn viaje no es vÃ¡lido (inexistente, ya facturado o de otro cliente)';
  end if;

  if p_lines is not null then
    v_lines := p_lines;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
              'trip_id',  t.id,
              'fecha',    t.fecha,
              'origen',   t.origen,
              'destino',  t.destino,
              'cantidad', 1,
              'precio',   t.importe
            ) order by t.fecha, t.created_at), '[]'::jsonb)
      into v_lines
      from public.trips t
      where t.id = any(p_trip_ids) and t.user_id = v_uid;
  end if;

  select coalesce(max(num), 0) + 1 into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;

  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));

  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_base from jsonb_array_elements(v_lines) l;
  v_base  := round(v_base, 2);
  v_iva   := round(v_base * v_iva_rate  / 100, 2);
  v_irpf  := round(v_base * v_irpf_rate / 100, 2);
  v_total := v_base + v_iva - v_irpf;

  v_emisor := coalesce(p_emisor, jsonb_build_object(
    'nombre', v_profile.nombre, 'nif', v_profile.nif, 'direccion', v_profile.direccion,
    'cp_localidad', v_profile.cp_localidad, 'iban', v_profile.iban, 'logo_url', v_profile.logo_url,
    'serie', v_serie));
  v_cliente := coalesce(p_cliente, jsonb_build_object(
    'nombre', v_client.nombre, 'nif', v_client.nif, 'direccion', v_client.direccion,
    'cp_localidad', v_client.cp_localidad, 'condiciones_pago', v_client.condiciones_pago));

  -- â˜… Identidad del emisor obligatoria: cada camionero debe registrar sus datos.
  if coalesce(btrim(v_emisor->>'nombre'), '') = '' or coalesce(btrim(v_emisor->>'nif'), '') = '' then
    raise exception 'Completa tus datos de emisor (nombre y NIF) en Mis datos antes de emitir facturas';
  end if;

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || coalesce(v_emisor->>'nif', '') ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(p_fecha, 'DD-MM-YYYY') ||
       '&TipoFactura=F1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || coalesce(v_emisor->>'nif', '') ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(p_fecha, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, p_client_id, p_fecha, p_forma_pago,
    v_base, v_iva_rate, v_iva, v_irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_emisor, v_cliente)
  returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.invoice_lines (
      user_id, invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe, orden)
    values (
      v_uid, v_invoice.id,
      nullif(v_line->>'trip_id', '')::uuid,
      nullif(v_line->>'fecha', '')::date,
      v_line->>'origen', v_line->>'destino',
      coalesce((v_line->>'cantidad')::numeric, 1),
      (v_line->>'precio')::numeric,
      round(coalesce((v_line->>'cantidad')::numeric, 1) * (v_line->>'precio')::numeric, 2),
      v_orden);
    v_orden := v_orden + 1;
  end loop;

  update public.trips set estado = 'facturado', invoice_id = v_invoice.id
    where id = any(p_trip_ids) and user_id = v_uid;

  update public.profiles set contador = v_chain where user_id = v_uid;

  return v_invoice;
end;
$$;


-- ####################################################################
-- ##### 0007_security_hardening.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0007_security_hardening.sql
-- Resuelve los avisos del Security Advisor de Supabase (los que procede).
--   1) Fija search_path en las funciones de trigger (evita secuestro de search_path).
--   2) Revoca EXECUTE de handle_new_user (es un trigger; nadie debe llamarlo a mano).
--   3) Quita el SELECT pÃºblico amplio del bucket de logos: las imÃ¡genes se siguen
--      sirviendo por su URL pÃºblica (bucket public=true), pero ya NO se pueden
--      LISTAR todos los ficheros vÃ­a API.
--
-- Nota: que `emit_invoice_from_trips` sea ejecutable por usuarios autenticados es
-- INTENCIONADO (es como se emiten facturas) y seguro (usa auth.uid() + valida
-- propiedad). Ese aviso se deja como estÃ¡.
-- ============================================================================

-- 1) search_path inmutable en funciones de trigger (no referencian objetos sin
--    cualificar, asÃ­ que '' es seguro).
alter function public.touch_updated_at() set search_path = '';
alter function public.enforce_invoice_immutable() set search_path = '';

-- 2) handle_new_user: trigger SECURITY DEFINER. Nadie debe poder invocarlo
--    directamente; el trigger sigue funcionando aunque se revoque EXECUTE.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- 3) Logos: quitar el SELECT pÃºblico (permitÃ­a listar todos los ficheros).
--    El bucket es pÃºblico, asÃ­ que las URLs pÃºblicas (getPublicUrl) siguen
--    funcionando para mostrar el logo en la app y en el PDF.
drop policy if exists logos_read_public on storage.objects;


-- ####################################################################
-- ##### 0008_grants.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0008_grants.sql
-- Concede al rol `authenticated` los permisos de tabla necesarios. RLS sigue
-- limitando QUÃ‰ filas ve/toca cada usuario (auth.uid()); estos GRANT solo dan
-- el permiso base sobre las tablas, que faltaba (error 42501).
--
-- No se concede nada a `anon`: la app exige login para todos los datos.
-- Las facturas/lineas no tienen policy de INSERT, asÃ­ que aunque exista el
-- GRANT, RLS sigue impidiendo inserciones directas (solo la funciÃ³n de emisiÃ³n).
-- ============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Para tablas/secuencias futuras (no haya que repetir esto):
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;


-- ####################################################################
-- ##### 0009_fix_digest_searchpath.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0009_fix_digest_searchpath.sql
-- En Supabase, pgcrypto (funciÃ³n digest = SHA-256) vive en el esquema
-- `extensions`. La funciÃ³n de emisiÃ³n tenÃ­a search_path = public, asÃ­ que no
-- encontraba digest() â†’ "function digest(bytea, unknown) does not exist".
--
-- 1) Asegura pgcrypto disponible (no-op si ya existe).
-- 2) AÃ±ade `extensions` al search_path de la funciÃ³n (cubre que pgcrypto estÃ©
--    en public o en extensions). Idempotente: se puede ejecutar varias veces.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

alter function public.emit_invoice_from_trips(
  uuid, uuid[], numeric, numeric, date, text, jsonb, jsonb, jsonb
) set search_path = public, extensions;


-- ####################################################################
-- ##### 0010_harden_emit_and_grants.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0010_harden_emit_and_grants.sql  (endurecimiento de seguridad)
--   1) La funciÃ³n de emisiÃ³n ya NO confÃ­a en p_emisor/p_cliente del cliente para
--      la IDENTIDAD fiscal: emisor se toma SIEMPRE del perfil del usuario y el
--      cliente de su ficha (en servidor). Evita falsificar el NIF que entra en
--      la huella/QR. (p_emisor/p_cliente se mantienen en la firma pero se ignoran.)
--   2) Permisos de tabla de invoices/invoice_lines: revocar escritura directa a
--      `authenticated` (la inmutabilidad ya no depende solo del trigger).
--   3) Bucket de logos: prohibir SVG (puede llevar JS).
-- ============================================================================

create or replace function public.emit_invoice_from_trips(
  p_client_id  uuid,
  p_trip_ids   uuid[],
  p_iva_rate   numeric default null,
  p_irpf_rate  numeric default null,
  p_fecha      date    default current_date,
  p_forma_pago text    default 'Transferencia',
  p_lines      jsonb   default null,
  p_emisor     jsonb   default null,   -- IGNORADO (se usa el perfil del servidor)
  p_cliente    jsonb   default null    -- IGNORADO (se usa la ficha del cliente)
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_client    public.clients;
  v_serie     text;
  v_anio      smallint := extract(year from p_fecha)::smallint;
  v_yy        text;
  v_num       int;
  v_chain     int;
  v_prev_hash text;
  v_iva_rate  numeric;
  v_irpf_rate numeric;
  v_base      numeric(12,2);
  v_iva       numeric(12,2);
  v_irpf      numeric(12,2);
  v_total     numeric(12,2);
  v_numero    text;
  v_gen_ts    timestamptz := now();
  v_gen_iso   text;
  v_emisor    jsonb;
  v_cliente   jsonb;
  v_huella    text;
  v_canonical text;
  v_qr        text;
  v_invoice   public.invoices;
  v_line      jsonb;
  v_orden     int := 0;
  v_lines     jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  if p_trip_ids is null or array_length(p_trip_ids, 1) is null then
    raise exception 'No hay viajes seleccionados';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_uid;
  if not found then
    raise exception 'Cliente no vÃ¡lido';
  end if;

  v_serie     := coalesce(v_profile.serie, 'FACT');
  v_iva_rate  := coalesce(p_iva_rate,  v_profile.iva_def,  21);
  v_irpf_rate := coalesce(p_irpf_rate, v_profile.irpf_def, 1);

  if exists (
    select 1
    from unnest(p_trip_ids) as tid
    left join public.trips t on t.id = tid and t.user_id = v_uid
    where t.id is null
       or t.estado <> 'pendiente'
       or t.client_id is distinct from p_client_id
  ) then
    raise exception 'AlgÃºn viaje no es vÃ¡lido (inexistente, ya facturado o de otro cliente)';
  end if;

  -- LÃ­neas (precios editables del porte). Si se pasan, deben corresponder a los
  -- viajes seleccionados; si no, se derivan de los viajes.
  if p_lines is not null then
    v_lines := p_lines;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
              'trip_id',  t.id, 'fecha', t.fecha, 'origen', t.origen,
              'destino',  t.destino, 'cantidad', 1, 'precio', t.importe
            ) order by t.fecha, t.created_at), '[]'::jsonb)
      into v_lines
      from public.trips t
      where t.id = any(p_trip_ids) and t.user_id = v_uid;
  end if;

  select coalesce(max(num), 0) + 1 into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;

  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));

  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_base from jsonb_array_elements(v_lines) l;
  v_base  := round(v_base, 2);
  v_iva   := round(v_base * v_iva_rate  / 100, 2);
  v_irpf  := round(v_base * v_irpf_rate / 100, 2);
  v_total := v_base + v_iva - v_irpf;

  -- â˜… Identidad fiscal SIEMPRE desde el servidor (no se acepta override del cliente).
  v_emisor := jsonb_build_object(
    'nombre', v_profile.nombre, 'nif', v_profile.nif, 'direccion', v_profile.direccion,
    'cp_localidad', v_profile.cp_localidad, 'iban', v_profile.iban,
    'logo_url', v_profile.logo_url, 'serie', v_serie);
  v_cliente := jsonb_build_object(
    'nombre', v_client.nombre, 'nif', v_client.nif, 'direccion', v_client.direccion,
    'cp_localidad', v_client.cp_localidad, 'condiciones_pago', v_client.condiciones_pago);

  if coalesce(btrim(v_emisor->>'nombre'), '') = '' or coalesce(btrim(v_emisor->>'nif'), '') = '' then
    raise exception 'Completa tus datos de emisor (nombre y NIF) en Mis datos antes de emitir facturas';
  end if;

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || coalesce(v_emisor->>'nif', '') ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(p_fecha, 'DD-MM-YYYY') ||
       '&TipoFactura=F1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || coalesce(v_emisor->>'nif', '') ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(p_fecha, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, p_client_id, p_fecha, p_forma_pago,
    v_base, v_iva_rate, v_iva, v_irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_emisor, v_cliente)
  returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.invoice_lines (
      user_id, invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe, orden)
    values (
      v_uid, v_invoice.id,
      nullif(v_line->>'trip_id', '')::uuid,
      nullif(v_line->>'fecha', '')::date,
      v_line->>'origen', v_line->>'destino',
      coalesce((v_line->>'cantidad')::numeric, 1),
      (v_line->>'precio')::numeric,
      round(coalesce((v_line->>'cantidad')::numeric, 1) * (v_line->>'precio')::numeric, 2),
      v_orden);
    v_orden := v_orden + 1;
  end loop;

  update public.trips set estado = 'facturado', invoice_id = v_invoice.id
    where id = any(p_trip_ids) and user_id = v_uid;

  update public.profiles set contador = v_chain where user_id = v_uid;

  return v_invoice;
end;
$$;

-- 2) Inmutabilidad reforzada: el rol authenticated no escribe directamente
--    invoices/invoice_lines (solo lee; en invoices puede cambiar `pagada`).
revoke insert, update, delete on public.invoices from authenticated;
revoke insert, update, delete on public.invoice_lines from authenticated;
grant select on public.invoices to authenticated;
grant update (pagada) on public.invoices to authenticated;
grant select on public.invoice_lines to authenticated;

-- 3) Logos: prohibir SVG (puede contener JavaScript).
update storage.buckets
  set allowed_mime_types = array['image/png','image/jpeg','image/webp']
  where id = 'logos';


-- ####################################################################
-- ##### 0011_ai_rate_limit.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0011_ai_rate_limit.sql
-- LÃ­mite de uso del escaneo con IA por usuario (evita abuso y coste descontrolado
-- de la API de Claude). Tabla de eventos + funciÃ³n atÃ³mica que cuenta y registra.
-- ============================================================================

create table if not exists public.ai_scan_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_scan_events_user_time_idx
  on public.ai_scan_events(user_id, created_at);

alter table public.ai_scan_events enable row level security;
-- Sin policies: los clientes no acceden directamente; solo la funciÃ³n definer.

-- Devuelve true si se permite un escaneo mÃ¡s (y lo registra); false si excede
-- el lÃ­mite por minuto o por dÃ­a. AtÃ³mico bajo el rol definer.
create or replace function public.allow_ai_scan(
  p_per_min int default 6,
  p_per_day int default 100
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min int;
  v_day int;
begin
  if v_uid is null then
    return false;
  end if;

  select count(*) into v_min from public.ai_scan_events
    where user_id = v_uid and created_at > now() - interval '1 minute';
  select count(*) into v_day from public.ai_scan_events
    where user_id = v_uid and created_at > now() - interval '1 day';

  if v_min >= p_per_min or v_day >= p_per_day then
    return false;
  end if;

  insert into public.ai_scan_events(user_id) values (v_uid);
  return true;
end;
$$;

revoke all on function public.allow_ai_scan(int, int) from public;
grant execute on function public.allow_ai_scan(int, int) to authenticated;


-- ####################################################################
-- ##### 0012_rectificativas.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0012_rectificativas.sql
-- Facturas rectificativas (subsanar errores SIN tocar la original):
--   - Una factura emitida es inmutable; un error se corrige con una factura
--     RECTIFICATIVA que la referencia (RD 1619/2012) y que se encadena con su
--     propia huella (forward-compatible con Verifactu, tipos R1-R5).
--   - MVP: rectificativa de ANULACIÃ“N (importes negados que dejan la original a
--     cero) + liberaciÃ³n de sus viajes a 'pendiente' para poder re-facturar.
-- ============================================================================

alter table public.invoices
  add column if not exists tipo         text not null default 'F1',   -- F1 normal, R1 rectificativa
  add column if not exists rectifica_id uuid references public.invoices(id),
  add column if not exists motivo       text;

-- Inmutabilidad: ademÃ¡s de lo anterior, tipo/rectifica_id/motivo no cambian.
create or replace function public.enforce_invoice_immutable()
returns trigger language plpgsql as $$
begin
  if  new.numero            is distinct from old.numero
   or new.serie             is distinct from old.serie
   or new.anio              is distinct from old.anio
   or new.num               is distinct from old.num
   or new.chain_index       is distinct from old.chain_index
   or new.client_id         is distinct from old.client_id
   or new.fecha             is distinct from old.fecha
   or new.base              is distinct from old.base
   or new.iva_rate          is distinct from old.iva_rate
   or new.iva               is distinct from old.iva
   or new.irpf_rate         is distinct from old.irpf_rate
   or new.irpf              is distinct from old.irpf
   or new.total             is distinct from old.total
   or new.prev_hash         is distinct from old.prev_hash
   or new.huella            is distinct from old.huella
   or new.gen_ts            is distinct from old.gen_ts
   or new.emisor_snapshot   is distinct from old.emisor_snapshot
   or new.cliente_snapshot  is distinct from old.cliente_snapshot
   or new.tipo              is distinct from old.tipo
   or new.rectifica_id      is distinct from old.rectifica_id
   or new.motivo            is distinct from old.motivo
  then
    raise exception 'Una factura emitida es inmutable: solo puede cambiar el estado de pago.';
  end if;
  return new;
end;
$$;

-- â”€â”€â”€ EmisiÃ³n de rectificativa (anulaciÃ³n) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.emit_rectificativa(
  p_original_id uuid,
  p_motivo      text default null
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_orig      public.invoices;
  v_serie     text;
  v_anio      smallint;
  v_yy        text;
  v_num       int;
  v_chain     int;
  v_prev_hash text;
  v_base      numeric(12,2);
  v_iva       numeric(12,2);
  v_irpf      numeric(12,2);
  v_total     numeric(12,2);
  v_numero    text;
  v_gen_ts    timestamptz := now();
  v_gen_iso   text;
  v_nif       text;
  v_canonical text;
  v_huella    text;
  v_qr        text;
  v_inv       public.invoices;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  select * into v_orig from public.invoices where id = p_original_id and user_id = v_uid;
  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_orig.tipo <> 'F1' then
    raise exception 'Solo se pueden rectificar facturas normales';
  end if;
  if exists (select 1 from public.invoices where rectifica_id = p_original_id and user_id = v_uid) then
    raise exception 'Esta factura ya tiene una rectificativa';
  end if;

  v_serie := v_orig.serie;
  v_anio  := extract(year from v_gen_ts)::smallint;

  select coalesce(max(num), 0) + 1 into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;

  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));

  -- AnulaciÃ³n: importes negados (dejan la original a cero).
  v_base  := -v_orig.base;
  v_iva   := -v_orig.iva;
  v_irpf  := -v_orig.irpf;
  v_total := -v_orig.total;
  v_nif   := coalesce(v_orig.emisor_snapshot->>'nif', '');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || v_nif ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
       '&TipoFactura=R1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || v_nif ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot, tipo, rectifica_id, motivo)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, v_orig.client_id, v_gen_ts::date, v_orig.forma_pago,
    v_base, v_orig.iva_rate, v_iva, v_orig.irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_orig.emisor_snapshot, v_orig.cliente_snapshot, 'R1', p_original_id, p_motivo)
  returning * into v_inv;

  -- LÃ­neas negadas (copia de la original, sin enlazar al viaje).
  insert into public.invoice_lines (
    user_id, invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe, orden)
  select v_uid, v_inv.id, null, l.fecha, l.origen, l.destino, l.cantidad, -l.precio, -l.importe, l.orden
  from public.invoice_lines l where l.invoice_id = p_original_id;

  -- Liberar los viajes de la original para poder re-facturarlos.
  update public.trips set estado = 'pendiente', invoice_id = null
    where invoice_id = p_original_id and user_id = v_uid;

  update public.profiles set contador = v_chain where user_id = v_uid;

  return v_inv;
end;
$$;

revoke all on function public.emit_rectificativa(uuid, text) from public;
grant execute on function public.emit_rectificativa(uuid, text) to authenticated;


-- ####################################################################
-- ##### 0013_rectificativa_diferencias.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0013_rectificativa_diferencias.sql
-- Rectificativa POR DIFERENCIAS (corregir un importe sin anular ni rehacer):
--   emite una rectificativa que contiene SOLO la diferencia (corregido - original),
--   referenciando la original. La original sigue vÃ¡lida; original + rectificativa
--   = importe correcto. No libera viajes (siguen facturados).
-- ============================================================================

create or replace function public.emit_rectificativa_dif(
  p_original_id uuid,
  p_lines       jsonb,            -- lÃ­neas corregidas [{cantidad, precio}] en el MISMO orden
  p_motivo      text default null
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid        uuid := auth.uid();
  v_profile    public.profiles;
  v_orig       public.invoices;
  v_orig_n     int;
  v_corr_n     int;
  v_corr_base  numeric(12,2);
  v_corr_iva   numeric(12,2);
  v_corr_irpf  numeric(12,2);
  v_corr_total numeric(12,2);
  v_base       numeric(12,2);
  v_iva        numeric(12,2);
  v_irpf       numeric(12,2);
  v_total      numeric(12,2);
  v_serie      text;
  v_anio       smallint;
  v_yy         text;
  v_num        int;
  v_chain      int;
  v_prev_hash  text;
  v_numero     text;
  v_gen_ts     timestamptz := now();
  v_gen_iso    text;
  v_nif        text;
  v_canonical  text;
  v_huella     text;
  v_qr         text;
  v_inv        public.invoices;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then raise exception 'Perfil no encontrado'; end if;

  select * into v_orig from public.invoices where id = p_original_id and user_id = v_uid;
  if not found then raise exception 'Factura no encontrada'; end if;
  if v_orig.tipo <> 'F1' then raise exception 'Solo se pueden rectificar facturas normales'; end if;
  if exists (select 1 from public.invoices where rectifica_id = p_original_id and user_id = v_uid) then
    raise exception 'Esta factura ya tiene una rectificativa';
  end if;

  select count(*) into v_orig_n from public.invoice_lines where invoice_id = p_original_id;
  select count(*) into v_corr_n from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb));
  if v_corr_n <> v_orig_n then
    raise exception 'Las lÃ­neas corregidas no cuadran con la factura';
  end if;

  -- Importes corregidos (con los tipos de IVA/IRPF de la original).
  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_corr_base from jsonb_array_elements(p_lines) l;
  v_corr_base  := round(v_corr_base, 2);
  v_corr_iva   := round(v_corr_base * v_orig.iva_rate  / 100, 2);
  v_corr_irpf  := round(v_corr_base * v_orig.irpf_rate / 100, 2);
  v_corr_total := v_corr_base + v_corr_iva - v_corr_irpf;

  -- Diferencias (lo que va en la rectificativa).
  v_base  := v_corr_base  - v_orig.base;
  v_iva   := v_corr_iva   - v_orig.iva;
  v_irpf  := v_corr_irpf  - v_orig.irpf;
  v_total := v_corr_total - v_orig.total;

  if v_base = 0 and v_iva = 0 and v_irpf = 0 then
    raise exception 'No hay cambios de importe que rectificar';
  end if;

  v_serie := v_orig.serie;
  v_anio  := extract(year from v_gen_ts)::smallint;
  select coalesce(max(num), 0) + 1 into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;
  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));
  v_nif    := coalesce(v_orig.emisor_snapshot->>'nif', '');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || v_nif ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
       '&TipoFactura=R1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || v_nif ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot, tipo, rectifica_id, motivo)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, v_orig.client_id, v_gen_ts::date, v_orig.forma_pago,
    v_base, v_orig.iva_rate, v_iva, v_orig.irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_orig.emisor_snapshot, v_orig.cliente_snapshot, 'R1', p_original_id, p_motivo)
  returning * into v_inv;

  -- LÃ­neas = diferencia por lÃ­nea (mismo orden), solo las que cambian de precio.
  insert into public.invoice_lines (
    user_id, invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe, orden)
  select
    v_uid, v_inv.id, null, o.fecha, o.origen, o.destino, o.cantidad,
    (l->>'precio')::numeric - o.precio,
    round(o.cantidad * ((l->>'precio')::numeric - o.precio), 2),
    o.orden
  from jsonb_array_elements(p_lines) with ordinality as t(l, idx)
  join public.invoice_lines o on o.invoice_id = p_original_id and o.orden = (idx - 1)::int
  where (l->>'precio')::numeric <> o.precio;

  -- La original sigue vÃ¡lida; no se anula ni se liberan viajes.
  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_inv;
end;
$$;

revoke all on function public.emit_rectificativa_dif(uuid, jsonb, text) from public;
grant execute on function public.emit_rectificativa_dif(uuid, jsonb, text) to authenticated;


-- ####################################################################
-- ##### 0014_descripcion_porte.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0014_descripcion_porte.sql
-- DescripciÃ³n del porte (peso/tonelaje/tipo de carga) en el viaje, que se
-- arrastra a la lÃ­nea de la factura. Se recrean las 3 funciones de emisiÃ³n para
-- transportar el campo `descripcion`.
-- ============================================================================

alter table public.trips         add column if not exists descripcion text;
alter table public.invoice_lines add column if not exists descripcion text;

-- â”€â”€â”€ emit_invoice_from_trips (con descripciÃ³n) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.emit_invoice_from_trips(
  p_client_id  uuid,
  p_trip_ids   uuid[],
  p_iva_rate   numeric default null,
  p_irpf_rate  numeric default null,
  p_fecha      date    default current_date,
  p_forma_pago text    default 'Transferencia',
  p_lines      jsonb   default null,
  p_emisor     jsonb   default null,
  p_cliente    jsonb   default null
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_client    public.clients;
  v_serie     text;
  v_anio      smallint := extract(year from p_fecha)::smallint;
  v_yy        text;
  v_num       int;
  v_chain     int;
  v_prev_hash text;
  v_iva_rate  numeric;
  v_irpf_rate numeric;
  v_base      numeric(12,2);
  v_iva       numeric(12,2);
  v_irpf      numeric(12,2);
  v_total     numeric(12,2);
  v_numero    text;
  v_gen_ts    timestamptz := now();
  v_gen_iso   text;
  v_emisor    jsonb;
  v_cliente   jsonb;
  v_huella    text;
  v_canonical text;
  v_qr        text;
  v_invoice   public.invoices;
  v_line      jsonb;
  v_orden     int := 0;
  v_lines     jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then raise exception 'Perfil no encontrado'; end if;

  if p_trip_ids is null or array_length(p_trip_ids, 1) is null then
    raise exception 'No hay viajes seleccionados';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_uid;
  if not found then raise exception 'Cliente no vÃ¡lido'; end if;

  v_serie     := coalesce(v_profile.serie, 'FACT');
  v_iva_rate  := coalesce(p_iva_rate,  v_profile.iva_def,  21);
  v_irpf_rate := coalesce(p_irpf_rate, v_profile.irpf_def, 1);

  if exists (
    select 1 from unnest(p_trip_ids) as tid
    left join public.trips t on t.id = tid and t.user_id = v_uid
    where t.id is null or t.estado <> 'pendiente' or t.client_id is distinct from p_client_id
  ) then
    raise exception 'AlgÃºn viaje no es vÃ¡lido (inexistente, ya facturado o de otro cliente)';
  end if;

  if p_lines is not null then
    v_lines := p_lines;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
              'trip_id', t.id, 'fecha', t.fecha, 'origen', t.origen, 'destino', t.destino,
              'descripcion', t.descripcion, 'cantidad', 1, 'precio', t.importe
            ) order by t.fecha, t.created_at), '[]'::jsonb)
      into v_lines
      from public.trips t where t.id = any(p_trip_ids) and t.user_id = v_uid;
  end if;

  select coalesce(max(num), 0) + 1 into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;

  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));

  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_base from jsonb_array_elements(v_lines) l;
  v_base  := round(v_base, 2);
  v_iva   := round(v_base * v_iva_rate  / 100, 2);
  v_irpf  := round(v_base * v_irpf_rate / 100, 2);
  v_total := v_base + v_iva - v_irpf;

  v_emisor := jsonb_build_object(
    'nombre', v_profile.nombre, 'nif', v_profile.nif, 'direccion', v_profile.direccion,
    'cp_localidad', v_profile.cp_localidad, 'iban', v_profile.iban,
    'logo_url', v_profile.logo_url, 'serie', v_serie);
  v_cliente := jsonb_build_object(
    'nombre', v_client.nombre, 'nif', v_client.nif, 'direccion', v_client.direccion,
    'cp_localidad', v_client.cp_localidad, 'condiciones_pago', v_client.condiciones_pago);

  if coalesce(btrim(v_emisor->>'nombre'), '') = '' or coalesce(btrim(v_emisor->>'nif'), '') = '' then
    raise exception 'Completa tus datos de emisor (nombre y NIF) en Mis datos antes de emitir facturas';
  end if;

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || coalesce(v_emisor->>'nif', '') ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(p_fecha, 'DD-MM-YYYY') ||
       '&TipoFactura=F1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || coalesce(v_emisor->>'nif', '') ||
          '&numserie=' || v_numero || '&fecha=' || to_char(p_fecha, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, p_client_id, p_fecha, p_forma_pago,
    v_base, v_iva_rate, v_iva, v_irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_emisor, v_cliente)
  returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.invoice_lines (
      user_id, invoice_id, trip_id, fecha, origen, destino, descripcion, cantidad, precio, importe, orden)
    values (
      v_uid, v_invoice.id,
      nullif(v_line->>'trip_id', '')::uuid,
      nullif(v_line->>'fecha', '')::date,
      v_line->>'origen', v_line->>'destino', v_line->>'descripcion',
      coalesce((v_line->>'cantidad')::numeric, 1),
      (v_line->>'precio')::numeric,
      round(coalesce((v_line->>'cantidad')::numeric, 1) * (v_line->>'precio')::numeric, 2),
      v_orden);
    v_orden := v_orden + 1;
  end loop;

  update public.trips set estado = 'facturado', invoice_id = v_invoice.id
    where id = any(p_trip_ids) and user_id = v_uid;
  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_invoice;
end;
$$;

-- â”€â”€â”€ emit_rectificativa: copia la descripciÃ³n de la original â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.emit_rectificativa(p_original_id uuid, p_motivo text default null)
returns public.invoices language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid(); v_profile public.profiles; v_orig public.invoices;
  v_serie text; v_anio smallint; v_yy text; v_num int; v_chain int; v_prev_hash text;
  v_base numeric(12,2); v_iva numeric(12,2); v_irpf numeric(12,2); v_total numeric(12,2);
  v_numero text; v_gen_ts timestamptz := now(); v_gen_iso text; v_nif text;
  v_canonical text; v_huella text; v_qr text; v_inv public.invoices;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then raise exception 'Perfil no encontrado'; end if;
  select * into v_orig from public.invoices where id = p_original_id and user_id = v_uid;
  if not found then raise exception 'Factura no encontrada'; end if;
  if v_orig.tipo <> 'F1' then raise exception 'Solo se pueden rectificar facturas normales'; end if;
  if exists (select 1 from public.invoices where rectifica_id = p_original_id and user_id = v_uid) then
    raise exception 'Esta factura ya tiene una rectificativa';
  end if;

  v_serie := v_orig.serie; v_anio := extract(year from v_gen_ts)::smallint;
  select coalesce(max(num),0)+1 into v_num from public.invoices where user_id=v_uid and serie=v_serie and anio=v_anio;
  select coalesce(max(chain_index),0)+1 into v_chain from public.invoices where user_id=v_uid;
  select huella into v_prev_hash from public.invoices where user_id=v_uid and chain_index=v_chain-1;
  v_yy := lpad((v_anio%100)::text,2,'0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text,2,'0'));

  v_base := -v_orig.base; v_iva := -v_orig.iva; v_irpf := -v_orig.irpf; v_total := -v_orig.total;
  v_nif := coalesce(v_orig.emisor_snapshot->>'nif','');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical := 'IDEmisorFactura='||v_nif||'&NumSerieFactura='||v_numero||
    '&FechaExpedicionFactura='||to_char(v_gen_ts::date,'DD-MM-YYYY')||'&TipoFactura=R1'||
    '&CuotaTotal='||to_char(v_iva,'FM9999999990.00')||'&ImporteTotal='||to_char(v_total,'FM9999999990.00')||
    '&Huella='||coalesce(v_prev_hash,'')||'&FechaHoraHusoGenRegistro='||v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical,'UTF8'),'sha256'),'hex'));
  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif='||v_nif||'&numserie='||v_numero||
    '&fecha='||to_char(v_gen_ts::date,'DD-MM-YYYY')||'&importe='||to_char(v_total,'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot, tipo, rectifica_id, motivo)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, v_orig.client_id, v_gen_ts::date, v_orig.forma_pago,
    v_base, v_orig.iva_rate, v_iva, v_orig.irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_orig.emisor_snapshot, v_orig.cliente_snapshot, 'R1', p_original_id, p_motivo)
  returning * into v_inv;

  insert into public.invoice_lines (
    user_id, invoice_id, trip_id, fecha, origen, destino, descripcion, cantidad, precio, importe, orden)
  select v_uid, v_inv.id, null, l.fecha, l.origen, l.destino, l.descripcion, l.cantidad, -l.precio, -l.importe, l.orden
  from public.invoice_lines l where l.invoice_id = p_original_id;

  update public.trips set estado='pendiente', invoice_id=null where invoice_id = p_original_id and user_id = v_uid;
  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_inv;
end; $$;

-- â”€â”€â”€ emit_rectificativa_dif: conserva la descripciÃ³n de la original â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.emit_rectificativa_dif(p_original_id uuid, p_lines jsonb, p_motivo text default null)
returns public.invoices language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid(); v_profile public.profiles; v_orig public.invoices;
  v_orig_n int; v_corr_n int;
  v_corr_base numeric(12,2); v_corr_iva numeric(12,2); v_corr_irpf numeric(12,2); v_corr_total numeric(12,2);
  v_base numeric(12,2); v_iva numeric(12,2); v_irpf numeric(12,2); v_total numeric(12,2);
  v_serie text; v_anio smallint; v_yy text; v_num int; v_chain int; v_prev_hash text;
  v_numero text; v_gen_ts timestamptz := now(); v_gen_iso text; v_nif text;
  v_canonical text; v_huella text; v_qr text; v_inv public.invoices;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then raise exception 'Perfil no encontrado'; end if;
  select * into v_orig from public.invoices where id = p_original_id and user_id = v_uid;
  if not found then raise exception 'Factura no encontrada'; end if;
  if v_orig.tipo <> 'F1' then raise exception 'Solo se pueden rectificar facturas normales'; end if;
  if exists (select 1 from public.invoices where rectifica_id = p_original_id and user_id = v_uid) then
    raise exception 'Esta factura ya tiene una rectificativa';
  end if;

  select count(*) into v_orig_n from public.invoice_lines where invoice_id = p_original_id;
  select count(*) into v_corr_n from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb));
  if v_corr_n <> v_orig_n then raise exception 'Las lÃ­neas corregidas no cuadran con la factura'; end if;

  select coalesce(sum((l->>'cantidad')::numeric*(l->>'precio')::numeric),0) into v_corr_base from jsonb_array_elements(p_lines) l;
  v_corr_base := round(v_corr_base,2);
  v_corr_iva := round(v_corr_base * v_orig.iva_rate/100, 2);
  v_corr_irpf := round(v_corr_base * v_orig.irpf_rate/100, 2);
  v_corr_total := v_corr_base + v_corr_iva - v_corr_irpf;
  v_base := v_corr_base - v_orig.base; v_iva := v_corr_iva - v_orig.iva;
  v_irpf := v_corr_irpf - v_orig.irpf; v_total := v_corr_total - v_orig.total;
  if v_base = 0 and v_iva = 0 and v_irpf = 0 then raise exception 'No hay cambios de importe que rectificar'; end if;

  v_serie := v_orig.serie; v_anio := extract(year from v_gen_ts)::smallint;
  select coalesce(max(num),0)+1 into v_num from public.invoices where user_id=v_uid and serie=v_serie and anio=v_anio;
  select coalesce(max(chain_index),0)+1 into v_chain from public.invoices where user_id=v_uid;
  select huella into v_prev_hash from public.invoices where user_id=v_uid and chain_index=v_chain-1;
  v_yy := lpad((v_anio%100)::text,2,'0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text,2,'0'));
  v_nif := coalesce(v_orig.emisor_snapshot->>'nif','');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical := 'IDEmisorFactura='||v_nif||'&NumSerieFactura='||v_numero||
    '&FechaExpedicionFactura='||to_char(v_gen_ts::date,'DD-MM-YYYY')||'&TipoFactura=R1'||
    '&CuotaTotal='||to_char(v_iva,'FM9999999990.00')||'&ImporteTotal='||to_char(v_total,'FM9999999990.00')||
    '&Huella='||coalesce(v_prev_hash,'')||'&FechaHoraHusoGenRegistro='||v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical,'UTF8'),'sha256'),'hex'));
  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif='||v_nif||'&numserie='||v_numero||
    '&fecha='||to_char(v_gen_ts::date,'DD-MM-YYYY')||'&importe='||to_char(v_total,'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot, tipo, rectifica_id, motivo)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, v_orig.client_id, v_gen_ts::date, v_orig.forma_pago,
    v_base, v_orig.iva_rate, v_iva, v_orig.irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_orig.emisor_snapshot, v_orig.cliente_snapshot, 'R1', p_original_id, p_motivo)
  returning * into v_inv;

  insert into public.invoice_lines (
    user_id, invoice_id, trip_id, fecha, origen, destino, descripcion, cantidad, precio, importe, orden)
  select v_uid, v_inv.id, null, o.fecha, o.origen, o.destino, o.descripcion, o.cantidad,
         (l->>'precio')::numeric - o.precio,
         round(o.cantidad * ((l->>'precio')::numeric - o.precio), 2), o.orden
  from jsonb_array_elements(p_lines) with ordinality as t(l, idx)
  join public.invoice_lines o on o.invoice_id = p_original_id and o.orden = (idx-1)::int
  where (l->>'precio')::numeric <> o.precio;

  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_inv;
end; $$;


-- ####################################################################
-- ##### 0015_peso_viaje.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0015_peso_viaje.sql
-- Peso de la carga del viaje (numÃ©rico) con unidad t/kg. Sirve para mÃ©tricas de
-- rentabilidad por tonelada-kilÃ³metro (tÂ·km) en las estadÃ­sticas del periodo.
-- (No afecta a la factura: la descripciÃ³n de texto ya viaja a la factura.)
-- ============================================================================

alter table public.trips
  add column if not exists peso        numeric(12,3),
  add column if not exists peso_unidad text not null default 't'
    check (peso_unidad in ('t', 'kg'));


-- ####################################################################
-- ##### 0016_external_invoices.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0016_external_invoices.sql
-- Facturas externas: las que la cooperativa emite EN NOMBRE del autÃ³nomo
-- (facturaciÃ³n por terceros, art. 5 RD 1619/2012). Son INGRESOS suyos, pero
-- NO las genera la app ni entran en la cadena Verifactu (las emite el sistema
-- de la coop). AquÃ­ solo se REGISTRAN y ARCHIVAN para la contabilidad total.
--
-- Tabla separada de `invoices` a propÃ³sito: las facturas Verifactu son
-- inmutables y encadenadas; estas son editables y de numeraciÃ³n libre (la
-- serie/nÃºmero los pone la cooperativa). No deben mezclarse.
-- ============================================================================

create table if not exists public.external_invoices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fuente       text not null default 'cooperativa' check (fuente in ('cooperativa','otra')),
  numero       text not null,                 -- nÃºmero/serie tal cual lo asigna la coop
  fecha        date not null,
  cliente      text,                          -- destinatario / cliente final (texto libre)
  cliente_nif  text,
  concepto     text,
  base         numeric(12,2) not null default 0,
  iva_rate     numeric(5,2),
  iva          numeric(12,2) not null default 0,
  irpf_rate    numeric(5,2),
  irpf         numeric(12,2) not null default 0,
  total        numeric(12,2) not null default 0,   -- base + iva - irpf
  cobrada      boolean not null default false,
  archivo_url  text,                          -- ruta en bucket privado 'facturas'
  qr_raw       text,                          -- payload del QR Verifactu si se escanea (futuro)
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists external_invoices_user_idx on public.external_invoices(user_id);

alter table public.external_invoices enable row level security;

drop policy if exists external_invoices_all on public.external_invoices;
create policy external_invoices_all on public.external_invoices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_external_invoices_touch on public.external_invoices;
create trigger trg_external_invoices_touch before update on public.external_invoices
  for each row execute function public.touch_updated_at();

-- Grants (las default privileges de 0008 ya cubren tablas futuras, pero se
-- explicita por claridad y por si la migraciÃ³n la corre otro rol).
grant select, insert, update, delete on public.external_invoices to authenticated;

-- â”€â”€â”€ Bucket PRIVADO para el archivo de la factura externa (foto o PDF) â”€â”€â”€â”€â”€â”€â”€
-- A diferencia de 'recibos', admite PDF ademÃ¡s de imagen (las coop suelen
-- mandar la factura en PDF). Solo el dueÃ±o accede a facturas/{user_id}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facturas', 'facturas', false, 10485760,  -- 10 MB, privado
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists facturas_select_own on storage.objects;
drop policy if exists facturas_select_own on storage.objects;
create policy facturas_select_own on storage.objects
  for select using (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists facturas_insert_own on storage.objects;
drop policy if exists facturas_insert_own on storage.objects;
create policy facturas_insert_own on storage.objects
  for insert with check (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists facturas_update_own on storage.objects;
drop policy if exists facturas_update_own on storage.objects;
create policy facturas_update_own on storage.objects
  for update using (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists facturas_delete_own on storage.objects;
drop policy if exists facturas_delete_own on storage.objects;
create policy facturas_delete_own on storage.objects
  for delete using (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ####################################################################
-- ##### 0017_numero_inicial.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0017_numero_inicial.sql
-- NÃºmero de arranque al MIGRAR de facturaciÃ³n manual a la app: el usuario indica
-- el nÃºmero de su Ãºltima factura ya emitida fuera de la app y la numeraciÃ³n
-- continÃºa su serie (p. ej. Ãºltima 42 â†’ la app emite la 43).
--
-- Se implementa como un "suelo" en la funciÃ³n de emisiÃ³n: el siguiente nÃºmero
-- es greatest(max(num), num_inicial) + 1. Solo aplica a la (serie, aÃ±o) para los
-- que se fijÃ³, para no afectar a otras series ni al reinicio anual. Una vez hay
-- facturas emitidas, max(num) manda y el suelo es irrelevante (no crea huecos).
-- ============================================================================

alter table public.profiles
  add column if not exists num_inicial       int,        -- Ãºltimo nÂº emitido fuera de la app
  add column if not exists num_inicial_anio  smallint,   -- aÃ±o al que aplica ese suelo
  add column if not exists num_inicial_serie text;       -- serie a la que aplica ese suelo

create or replace function public.emit_invoice_from_trips(
  p_client_id  uuid,
  p_trip_ids   uuid[],
  p_iva_rate   numeric default null,
  p_irpf_rate  numeric default null,
  p_fecha      date    default current_date,
  p_forma_pago text    default 'Transferencia',
  p_lines      jsonb   default null,
  p_emisor     jsonb   default null,   -- IGNORADO (se usa el perfil del servidor)
  p_cliente    jsonb   default null    -- IGNORADO (se usa la ficha del cliente)
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_client    public.clients;
  v_serie     text;
  v_anio      smallint := extract(year from p_fecha)::smallint;
  v_yy        text;
  v_num       int;
  v_chain     int;
  v_prev_hash text;
  v_iva_rate  numeric;
  v_irpf_rate numeric;
  v_base      numeric(12,2);
  v_iva       numeric(12,2);
  v_irpf      numeric(12,2);
  v_total     numeric(12,2);
  v_numero    text;
  v_gen_ts    timestamptz := now();
  v_gen_iso   text;
  v_emisor    jsonb;
  v_cliente   jsonb;
  v_huella    text;
  v_canonical text;
  v_qr        text;
  v_invoice   public.invoices;
  v_line      jsonb;
  v_orden     int := 0;
  v_lines     jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  if p_trip_ids is null or array_length(p_trip_ids, 1) is null then
    raise exception 'No hay viajes seleccionados';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_uid;
  if not found then
    raise exception 'Cliente no vÃ¡lido';
  end if;

  v_serie     := coalesce(v_profile.serie, 'FACT');
  v_iva_rate  := coalesce(p_iva_rate,  v_profile.iva_def,  21);
  v_irpf_rate := coalesce(p_irpf_rate, v_profile.irpf_def, 1);

  if exists (
    select 1
    from unnest(p_trip_ids) as tid
    left join public.trips t on t.id = tid and t.user_id = v_uid
    where t.id is null
       or t.estado <> 'pendiente'
       or t.client_id is distinct from p_client_id
  ) then
    raise exception 'AlgÃºn viaje no es vÃ¡lido (inexistente, ya facturado o de otro cliente)';
  end if;

  -- LÃ­neas (precios editables del porte). Si se pasan, deben corresponder a los
  -- viajes seleccionados; si no, se derivan de los viajes.
  if p_lines is not null then
    v_lines := p_lines;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
              'trip_id',  t.id, 'fecha', t.fecha, 'origen', t.origen,
              'destino',  t.destino, 'cantidad', 1, 'precio', t.importe
            ) order by t.fecha, t.created_at), '[]'::jsonb)
      into v_lines
      from public.trips t
      where t.id = any(p_trip_ids) and t.user_id = v_uid;
  end if;

  -- Siguiente correlativo: max(num) de la (serie, aÃ±o). Con "suelo" de migraciÃ³n
  -- si el usuario fijÃ³ el nÃºmero de su Ãºltima factura para esta serie y aÃ±o.
  select coalesce(max(num), 0) into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  if v_profile.num_inicial is not null
     and v_profile.num_inicial_anio = v_anio
     and v_profile.num_inicial_serie = v_serie then
    v_num := greatest(v_num, v_profile.num_inicial);
  end if;
  v_num := v_num + 1;

  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;

  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));

  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_base from jsonb_array_elements(v_lines) l;
  v_base  := round(v_base, 2);
  v_iva   := round(v_base * v_iva_rate  / 100, 2);
  v_irpf  := round(v_base * v_irpf_rate / 100, 2);
  v_total := v_base + v_iva - v_irpf;

  -- â˜… Identidad fiscal SIEMPRE desde el servidor (no se acepta override del cliente).
  v_emisor := jsonb_build_object(
    'nombre', v_profile.nombre, 'nif', v_profile.nif, 'direccion', v_profile.direccion,
    'cp_localidad', v_profile.cp_localidad, 'iban', v_profile.iban,
    'logo_url', v_profile.logo_url, 'serie', v_serie);
  v_cliente := jsonb_build_object(
    'nombre', v_client.nombre, 'nif', v_client.nif, 'direccion', v_client.direccion,
    'cp_localidad', v_client.cp_localidad, 'condiciones_pago', v_client.condiciones_pago);

  if coalesce(btrim(v_emisor->>'nombre'), '') = '' or coalesce(btrim(v_emisor->>'nif'), '') = '' then
    raise exception 'Completa tus datos de emisor (nombre y NIF) en Mis datos antes de emitir facturas';
  end if;

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || coalesce(v_emisor->>'nif', '') ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(p_fecha, 'DD-MM-YYYY') ||
       '&TipoFactura=F1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || coalesce(v_emisor->>'nif', '') ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(p_fecha, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, p_client_id, p_fecha, p_forma_pago,
    v_base, v_iva_rate, v_iva, v_irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_emisor, v_cliente)
  returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.invoice_lines (
      user_id, invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe, orden)
    values (
      v_uid, v_invoice.id,
      nullif(v_line->>'trip_id', '')::uuid,
      nullif(v_line->>'fecha', '')::date,
      v_line->>'origen', v_line->>'destino',
      coalesce((v_line->>'cantidad')::numeric, 1),
      (v_line->>'precio')::numeric,
      round(coalesce((v_line->>'cantidad')::numeric, 1) * (v_line->>'precio')::numeric, 2),
      v_orden);
    v_orden := v_orden + 1;
  end loop;

  update public.trips set estado = 'facturado', invoice_id = v_invoice.id
    where id = any(p_trip_ids) and user_id = v_uid;

  update public.profiles set contador = v_chain where user_id = v_uid;

  return v_invoice;
end;
$$;


-- ####################################################################
-- ##### 0018_rectifica_unico.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0018_rectifica_unico.sql
-- GarantÃ­a a nivel de BD de que una factura solo puede ser rectificada/anulada
-- UNA vez. Las funciones emit_rectificativa(_dif) ya lo comprueban con un
-- `if exists`, pero ese chequeo es vulnerable a una carrera entre dos emisiones
-- simultÃ¡neas. Un Ã­ndice Ãºnico parcial lo blinda: el segundo INSERT con el
-- mismo rectifica_id falla en la propia base de datos.
--
-- rectifica_id es el id (UUID global) de la factura original â†’ Ãºnico en toda la
-- tabla cuando no es null.
-- ============================================================================

create unique index if not exists invoices_rectifica_id_unico
  on public.invoices (rectifica_id)
  where rectifica_id is not null;


-- ####################################################################
-- ##### 0019_registro_eventos.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0019_registro_eventos.sql
-- Registro de eventos (Art. 8.3 RD 1007/2023): el sistema recoge de forma
-- automÃ¡tica las operaciones relevantes (emisiÃ³n, rectificaciÃ³n, alta/baja de
-- facturas externas, cambios de numeraciÃ³nâ€¦). Requisitos que cubrimos:
--   Â· AutomÃ¡tico: lo escribe la funciÃ³n log_event, llamada por las operaciones.
--   Â· Inalterable y con detecciÃ³n (Art. 8.2.a): tabla solo-anexable (trigger que
--     bloquea UPDATE/DELETE) + cadena de huellas SHA-256 por usuario, de modo
--     que manipular o borrar un evento rompe la cadena y se detecta.
--   Â· Consultable desde el sistema: pantalla /ajustes/eventos.
-- ============================================================================

create table if not exists public.system_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo         text not null,                 -- p. ej. 'factura_emitida'
  detalle      jsonb not null default '{}'::jsonb,
  entidad      text,                          -- 'factura' | 'factura_externa' | 'perfil'
  entidad_id   text,                          -- id/numero de la entidad afectada
  chain_index  int  not null,                 -- posiciÃ³n en la cadena del usuario
  prev_hash    text,                          -- huella del evento anterior (null en el 1Âº)
  huella       text not null,                 -- SHA-256 encadenada (hex mayÃºsculas)
  created_at   timestamptz not null default now(),
  unique (user_id, chain_index)
);
create index if not exists system_events_user_time_idx
  on public.system_events(user_id, created_at desc);

alter table public.system_events enable row level security;

-- Lectura: solo los propios. InserciÃ³n: SOLO vÃ­a log_event (definer). Sin
-- policies de insert/update/delete â†’ RLS las impide directamente.
drop policy if exists system_events_select on public.system_events;
drop policy if exists system_events_select on public.system_events;
create policy system_events_select on public.system_events
  for select using (user_id = auth.uid());

-- Solo-anexable: ni el dueÃ±o puede modificar o borrar un evento ya escrito.
create or replace function public.prevent_event_change()
returns trigger language plpgsql as $$
begin
  raise exception 'El registro de eventos es inalterable: no se puede modificar ni borrar.';
end;
$$;
drop trigger if exists trg_system_events_immutable on public.system_events;
drop trigger if exists trg_system_events_immutable on public.system_events;
create trigger trg_system_events_immutable
  before update or delete on public.system_events
  for each row execute function public.prevent_event_change();

-- Permisos: el rol authenticated solo lee; nunca escribe directamente.
revoke insert, update, delete on public.system_events from authenticated;
grant select on public.system_events to authenticated;

-- â”€â”€â”€ FunciÃ³n de registro: calcula la cadena y la huella, e inserta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.log_event(
  p_tipo       text,
  p_detalle    jsonb default '{}'::jsonb,
  p_entidad    text  default null,
  p_entidad_id text  default null
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_chain     int;
  v_prev      text;
  v_ts        timestamptz := now();
  v_ts_iso    text;
  v_canonical text;
  v_huella    text;
begin
  if v_uid is null then
    return; -- sin sesiÃ³n no se registra nada
  end if;

  -- Serializa el cÃ¡lculo de la cadena por usuario (evita carreras en chain_index).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 19));

  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.system_events where user_id = v_uid;
  select huella into v_prev
    from public.system_events where user_id = v_uid and chain_index = v_chain - 1;

  v_ts_iso := to_char(v_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       coalesce(v_uid::text, '') || '|' || p_tipo || '|' ||
       coalesce(p_detalle::text, '{}') || '|' ||
       coalesce(p_entidad, '') || '|' || coalesce(p_entidad_id, '') || '|' ||
       coalesce(v_prev, '') || '|' || v_ts_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  insert into public.system_events (
    user_id, tipo, detalle, entidad, entidad_id, chain_index, prev_hash, huella, created_at)
  values (
    v_uid, p_tipo, coalesce(p_detalle, '{}'::jsonb), p_entidad, p_entidad_id,
    v_chain, v_prev, v_huella, v_ts);
end;
$$;

revoke all on function public.log_event(text, jsonb, text, text) from public;
grant execute on function public.log_event(text, jsonb, text, text) to authenticated;


-- ####################################################################
-- ##### 0020_external_serie.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0020_external_serie.sql
-- Las facturas externas se organizan por SERIE con nombre (en vez del fijo
-- cooperativa/otra). La serie se detecta del nÃºmero (p. ej. "COOP/25-1234" â†’
-- "COOP") y el usuario le pone un nombre para saber de quÃ© es. La lista se
-- agrupa por serie.
--
-- Se aÃ±ade la columna `serie` (nombre dado por el usuario). La antigua `fuente`
-- se conserva en la BD para no romper datos, pero la app deja de usarla; se
-- rellena `serie` de las filas existentes a partir de ella.
-- ============================================================================

alter table public.external_invoices add column if not exists serie text;

update public.external_invoices
  set serie = case when fuente = 'cooperativa' then 'Cooperativa' else 'Otras' end
  where serie is null;


-- ####################################################################
-- ##### 0021_security_hardening.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0021_security_hardening.sql  (defensa en profundidad)
-- Hallazgos de la auditorÃ­a ofensiva (ninguno crÃ­tico):
--   1) Las policies UPDATE de storage tenÃ­an USING pero no WITH CHECK: en teorÃ­a
--      permitirÃ­an mover un objeto propio a una ruta fuera de la carpeta del
--      usuario. Se aÃ±ade WITH CHECK con la misma condiciÃ³n de carpeta.
--   2) allow_ai_scan exponÃ­a p_per_min/p_per_day y execute a authenticated: un
--      cliente podÃ­a llamarlo directamente con lÃ­mites altos. No era explotable
--      (las rutas usan los valores por defecto), pero se clampan dentro del
--      cuerpo para que ninguna llamada pueda elevar el lÃ­mite real (6/min,10/dÃ­a).
-- ============================================================================

-- â”€â”€â”€ 1) WITH CHECK en las policies UPDATE de storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists logos_update_own on storage.objects;
drop policy if exists logos_update_own on storage.objects;
create policy logos_update_own on storage.objects
  for update using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_update_own on storage.objects;
drop policy if exists recibos_update_own on storage.objects;
create policy recibos_update_own on storage.objects
  for update using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists facturas_update_own on storage.objects;
drop policy if exists facturas_update_own on storage.objects;
create policy facturas_update_own on storage.objects
  for update using (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- â”€â”€â”€ 2) allow_ai_scan: clampar los lÃ­mites dentro del cuerpo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.allow_ai_scan(
  p_per_min int default 6,
  p_per_day int default 10
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min int;
  v_day int;
  -- LÃ­mites reales acotados: ninguna llamada (ni directa) puede elevarlos.
  -- Fase de pruebas: 10 escaneos/dÃ­a por usuario para controlar el coste de IA.
  v_cap_min int := least(greatest(coalesce(p_per_min, 6), 1), 6);
  v_cap_day int := least(greatest(coalesce(p_per_day, 10), 1), 10);
begin
  if v_uid is null then
    return false;
  end if;

  select count(*) into v_min from public.ai_scan_events
    where user_id = v_uid and created_at > now() - interval '1 minute';
  select count(*) into v_day from public.ai_scan_events
    where user_id = v_uid and created_at > now() - interval '1 day';

  if v_min >= v_cap_min or v_day >= v_cap_day then
    return false;
  end if;

  insert into public.ai_scan_events(user_id) values (v_uid);
  return true;
end;
$$;

revoke all on function public.allow_ai_scan(int, int) from public;
grant execute on function public.allow_ai_scan(int, int) to authenticated;


-- ####################################################################
-- ##### 0022_incomes.sql
-- ####################################################################
-- ============================================================================
-- TrackApp Â· 0022_incomes.sql
-- Ingresos manuales: el usuario los apunta a mano, igual que los gastos. NO son
-- facturas Verifactu y NO se envÃ­an a la AEAT; solo se guardan en su cuenta para
-- llevar la contabilidad total (junto con los ingresos de facturas). Editables.
-- ============================================================================

create table if not exists public.incomes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concepto   text,
  cliente    text,
  fecha      date,
  base       numeric(12,2),
  iva_rate   numeric(5,2),
  iva        numeric(12,2),
  total      numeric(12,2) not null default 0,
  cobrada    boolean not null default true,
  notas      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists incomes_user_idx on public.incomes(user_id);

alter table public.incomes enable row level security;

drop policy if exists incomes_all on public.incomes;
create policy incomes_all on public.incomes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_incomes_touch on public.incomes;
create trigger trg_incomes_touch before update on public.incomes
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.incomes to authenticated;


