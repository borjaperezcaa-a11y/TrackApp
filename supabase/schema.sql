-- TrackApp - esquema completo (concatenacion de migrations 0001..0013).
-- Pega TODO esto en Supabase > SQL Editor > New query > Run.

-- ===== 0001_schema.sql =====
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


-- ===== 0002_rls.sql =====
-- ============================================================================
-- TrackApp · 0002_rls.sql
-- Row-Level Security en TODAS las tablas: cada usuario solo ve/toca SUS datos.
-- Innegociable (sección 7 del brief).
-- ============================================================================

alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.trips         enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.expenses      enable row level security;

-- ─── PROFILES ───────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles
  for select using (user_id = auth.uid());
create policy profiles_update on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- insert lo hace el trigger handle_new_user (security definer); no hace falta policy.

-- ─── CLIENTS ────────────────────────────────────────────────────────────────
create policy clients_all on public.clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── TRIPS ──────────────────────────────────────────────────────────────────
create policy trips_all on public.trips
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── EXPENSES ───────────────────────────────────────────────────────────────
create policy expenses_all on public.expenses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── INVOICES ───────────────────────────────────────────────────────────────
-- Lectura: las propias. Inserción: SOLO vía emit_invoice_from_trips() (definer).
-- Actualización: permitida pero un trigger limita los cambios a `pagada`.
-- Borrado: prohibido (factura emitida = inmutable).
create policy invoices_select on public.invoices
  for select using (user_id = auth.uid());
create policy invoices_update on public.invoices
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── INVOICE_LINES ──────────────────────────────────────────────────────────
-- Solo lectura para el cliente; las escribe la función de emisión.
create policy invoice_lines_select on public.invoice_lines
  for select using (user_id = auth.uid());

-- ─── Inmutabilidad de facturas: solo `pagada` puede cambiar ────────────────
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

create trigger trg_invoices_immutable
  before update on public.invoices
  for each row execute function public.enforce_invoice_immutable();


-- ===== 0003_emit_invoice.sql =====
-- ============================================================================
-- TrackApp · 0003_emit_invoice.sql
-- Emisión ATÓMICA de factura a partir de viajes. Todo en una transacción con
-- lock del perfil → numeración y cadena de huellas sin colisiones.
--
-- Huella canónica (idéntica a lib/verifactu/canonical.ts):
--   IDEmisorFactura={nif}&NumSerieFactura={numero}&FechaExpedicionFactura={DD-MM-YYYY}
--   &TipoFactura=F1&CuotaTotal={iva}&ImporteTotal={total}&Huella={prev}
--   &FechaHoraHusoGenRegistro={ISO8601 UTC con Z}   → SHA-256 → hex MAYÚSCULAS
--
-- AVISO: motor NO certificado. No envía a la AEAT ni firma con certificado.
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

  -- Lock del perfil → serializa la emisión por usuario.
  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  if p_trip_ids is null or array_length(p_trip_ids, 1) is null then
    raise exception 'No hay viajes seleccionados';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_uid;
  if not found then
    raise exception 'Cliente no válido';
  end if;

  v_serie     := coalesce(v_profile.serie, 'FACT');
  v_iva_rate  := coalesce(p_iva_rate,  v_profile.iva_def,  21);
  v_irpf_rate := coalesce(p_irpf_rate, v_profile.irpf_def, 1);

  -- Validar viajes: existen, son del usuario, están pendientes y son del cliente.
  if exists (
    select 1
    from unnest(p_trip_ids) as tid
    left join public.trips t on t.id = tid and t.user_id = v_uid
    where t.id is null
       or t.estado <> 'pendiente'
       or t.client_id is distinct from p_client_id
  ) then
    raise exception 'Algún viaje no es válido (inexistente, ya facturado o de otro cliente)';
  end if;

  -- Líneas: override del usuario o derivadas de los viajes (cantidad 1, precio=importe).
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

  -- Numeración por año + posición global en la cadena (todo bajo el lock).
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


-- ===== 0004_storage.sql =====
-- ============================================================================
-- TrackApp · 0004_storage.sql
-- Bucket para el logo del emisor (se imprime en la factura).
-- Lectura pública (el logo no es secreto y debe verse en el PDF), pero
-- escritura/borrado SOLO en la carpeta del propio usuario: logos/{user_id}/...
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos', 'logos', true, 2097152,  -- 2 MB
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists logos_read_public on storage.objects;
create policy logos_read_public on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists logos_insert_own on storage.objects;
create policy logos_insert_own on storage.objects
  for insert with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_update_own on storage.objects;
create policy logos_update_own on storage.objects
  for update using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_delete_own on storage.objects;
create policy logos_delete_own on storage.objects
  for delete using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ===== 0005_storage_recibos.sql =====
-- ============================================================================
-- TrackApp · 0005_storage_recibos.sql
-- Bucket PRIVADO para las fotos de tickets de gasto (dato personal/financiero,
-- RGPD). A diferencia de los logos, NO es público: solo el dueño accede a su
-- carpeta recibos/{user_id}/...  Para mostrarlos se usan URLs firmadas.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recibos', 'recibos', false, 8388608,  -- 8 MB, privado
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

drop policy if exists recibos_select_own on storage.objects;
create policy recibos_select_own on storage.objects
  for select using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_insert_own on storage.objects;
create policy recibos_insert_own on storage.objects
  for insert with check (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_update_own on storage.objects;
create policy recibos_update_own on storage.objects
  for update using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_delete_own on storage.objects;
create policy recibos_delete_own on storage.objects
  for delete using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ===== 0006_emit_requires_emisor.sql =====
-- ============================================================================
-- TrackApp · 0006_emit_requires_emisor.sql
-- Reemplaza emit_invoice_from_trips para EXIGIR que el emisor tenga identidad
-- (nombre + NIF) antes de emitir. Cada camionero debe registrar sus datos en
-- "Mis datos"; una factura sin emisor identificado no es válida.
-- (create or replace: aplica sobre la función de 0003 sin perder nada.)
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
    raise exception 'Cliente no válido';
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
    raise exception 'Algún viaje no es válido (inexistente, ya facturado o de otro cliente)';
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

  -- ★ Identidad del emisor obligatoria: cada camionero debe registrar sus datos.
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


-- ===== 0007_security_hardening.sql =====
-- ============================================================================
-- TrackApp · 0007_security_hardening.sql
-- Resuelve los avisos del Security Advisor de Supabase (los que procede).
--   1) Fija search_path en las funciones de trigger (evita secuestro de search_path).
--   2) Revoca EXECUTE de handle_new_user (es un trigger; nadie debe llamarlo a mano).
--   3) Quita el SELECT público amplio del bucket de logos: las imágenes se siguen
--      sirviendo por su URL pública (bucket public=true), pero ya NO se pueden
--      LISTAR todos los ficheros vía API.
--
-- Nota: que `emit_invoice_from_trips` sea ejecutable por usuarios autenticados es
-- INTENCIONADO (es como se emiten facturas) y seguro (usa auth.uid() + valida
-- propiedad). Ese aviso se deja como está.
-- ============================================================================

-- 1) search_path inmutable en funciones de trigger (no referencian objetos sin
--    cualificar, así que '' es seguro).
alter function public.touch_updated_at() set search_path = '';
alter function public.enforce_invoice_immutable() set search_path = '';

-- 2) handle_new_user: trigger SECURITY DEFINER. Nadie debe poder invocarlo
--    directamente; el trigger sigue funcionando aunque se revoque EXECUTE.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- 3) Logos: quitar el SELECT público (permitía listar todos los ficheros).
--    El bucket es público, así que las URLs públicas (getPublicUrl) siguen
--    funcionando para mostrar el logo en la app y en el PDF.
drop policy if exists logos_read_public on storage.objects;


-- ===== 0008_grants.sql =====
-- ============================================================================
-- TrackApp · 0008_grants.sql
-- Concede al rol `authenticated` los permisos de tabla necesarios. RLS sigue
-- limitando QUÉ filas ve/toca cada usuario (auth.uid()); estos GRANT solo dan
-- el permiso base sobre las tablas, que faltaba (error 42501).
--
-- No se concede nada a `anon`: la app exige login para todos los datos.
-- Las facturas/lineas no tienen policy de INSERT, así que aunque exista el
-- GRANT, RLS sigue impidiendo inserciones directas (solo la función de emisión).
-- ============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Para tablas/secuencias futuras (no haya que repetir esto):
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;


-- ===== 0009_fix_digest_searchpath.sql =====
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


-- ===== 0010_harden_emit_and_grants.sql =====
-- ============================================================================
-- TrackApp · 0010_harden_emit_and_grants.sql  (endurecimiento de seguridad)
--   1) La función de emisión ya NO confía en p_emisor/p_cliente del cliente para
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
    raise exception 'Cliente no válido';
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
    raise exception 'Algún viaje no es válido (inexistente, ya facturado o de otro cliente)';
  end if;

  -- Líneas (precios editables del porte). Si se pasan, deben corresponder a los
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

  -- ★ Identidad fiscal SIEMPRE desde el servidor (no se acepta override del cliente).
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


-- ===== 0011_ai_rate_limit.sql =====
-- ============================================================================
-- TrackApp · 0011_ai_rate_limit.sql
-- Límite de uso del escaneo con IA por usuario (evita abuso y coste descontrolado
-- de la API de Claude). Tabla de eventos + función atómica que cuenta y registra.
-- ============================================================================

create table if not exists public.ai_scan_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_scan_events_user_time_idx
  on public.ai_scan_events(user_id, created_at);

alter table public.ai_scan_events enable row level security;
-- Sin policies: los clientes no acceden directamente; solo la función definer.

-- Devuelve true si se permite un escaneo más (y lo registra); false si excede
-- el límite por minuto o por día. Atómico bajo el rol definer.
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


-- ===== 0012_rectificativas.sql =====
-- ============================================================================
-- TrackApp · 0012_rectificativas.sql
-- Facturas rectificativas (subsanar errores SIN tocar la original):
--   - Una factura emitida es inmutable; un error se corrige con una factura
--     RECTIFICATIVA que la referencia (RD 1619/2012) y que se encadena con su
--     propia huella (forward-compatible con Verifactu, tipos R1-R5).
--   - MVP: rectificativa de ANULACIÓN (importes negados que dejan la original a
--     cero) + liberación de sus viajes a 'pendiente' para poder re-facturar.
-- ============================================================================

alter table public.invoices
  add column if not exists tipo         text not null default 'F1',   -- F1 normal, R1 rectificativa
  add column if not exists rectifica_id uuid references public.invoices(id),
  add column if not exists motivo       text;

-- Inmutabilidad: además de lo anterior, tipo/rectifica_id/motivo no cambian.
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

-- ─── Emisión de rectificativa (anulación) ───────────────────────────────────
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

  -- Anulación: importes negados (dejan la original a cero).
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

  -- Líneas negadas (copia de la original, sin enlazar al viaje).
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


-- ===== 0013_rectificativa_diferencias.sql =====
-- ============================================================================
-- TrackApp · 0013_rectificativa_diferencias.sql
-- Rectificativa POR DIFERENCIAS (corregir un importe sin anular ni rehacer):
--   emite una rectificativa que contiene SOLO la diferencia (corregido - original),
--   referenciando la original. La original sigue válida; original + rectificativa
--   = importe correcto. No libera viajes (siguen facturados).
-- ============================================================================

create or replace function public.emit_rectificativa_dif(
  p_original_id uuid,
  p_lines       jsonb,            -- líneas corregidas [{cantidad, precio}] en el MISMO orden
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
    raise exception 'Las líneas corregidas no cuadran con la factura';
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

  -- Líneas = diferencia por línea (mismo orden), solo las que cambian de precio.
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

  -- La original sigue válida; no se anula ni se liberan viajes.
  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_inv;
end;
$$;

revoke all on function public.emit_rectificativa_dif(uuid, jsonb, text) from public;
grant execute on function public.emit_rectificativa_dif(uuid, jsonb, text) to authenticated;


