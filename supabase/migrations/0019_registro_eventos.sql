-- ============================================================================
-- TrackApp · 0019_registro_eventos.sql
-- Registro de eventos (Art. 8.3 RD 1007/2023): el sistema recoge de forma
-- automática las operaciones relevantes (emisión, rectificación, alta/baja de
-- facturas externas, cambios de numeración…). Requisitos que cubrimos:
--   · Automático: lo escribe la función log_event, llamada por las operaciones.
--   · Inalterable y con detección (Art. 8.2.a): tabla solo-anexable (trigger que
--     bloquea UPDATE/DELETE) + cadena de huellas SHA-256 por usuario, de modo
--     que manipular o borrar un evento rompe la cadena y se detecta.
--   · Consultable desde el sistema: pantalla /ajustes/eventos.
-- ============================================================================

create table if not exists public.system_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo         text not null,                 -- p. ej. 'factura_emitida'
  detalle      jsonb not null default '{}'::jsonb,
  entidad      text,                          -- 'factura' | 'factura_externa' | 'perfil'
  entidad_id   text,                          -- id/numero de la entidad afectada
  chain_index  int  not null,                 -- posición en la cadena del usuario
  prev_hash    text,                          -- huella del evento anterior (null en el 1º)
  huella       text not null,                 -- SHA-256 encadenada (hex mayúsculas)
  created_at   timestamptz not null default now(),
  unique (user_id, chain_index)
);
create index if not exists system_events_user_time_idx
  on public.system_events(user_id, created_at desc);

alter table public.system_events enable row level security;

-- Lectura: solo los propios. Inserción: SOLO vía log_event (definer). Sin
-- policies de insert/update/delete → RLS las impide directamente.
drop policy if exists system_events_select on public.system_events;
create policy system_events_select on public.system_events
  for select using (user_id = auth.uid());

-- Solo-anexable: ni el dueño puede modificar o borrar un evento ya escrito.
create or replace function public.prevent_event_change()
returns trigger language plpgsql as $$
begin
  raise exception 'El registro de eventos es inalterable: no se puede modificar ni borrar.';
end;
$$;
drop trigger if exists trg_system_events_immutable on public.system_events;
create trigger trg_system_events_immutable
  before update or delete on public.system_events
  for each row execute function public.prevent_event_change();

-- Permisos: el rol authenticated solo lee; nunca escribe directamente.
revoke insert, update, delete on public.system_events from authenticated;
grant select on public.system_events to authenticated;

-- ─── Función de registro: calcula la cadena y la huella, e inserta ───────────
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
    return; -- sin sesión no se registra nada
  end if;

  -- Serializa el cálculo de la cadena por usuario (evita carreras en chain_index).
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
