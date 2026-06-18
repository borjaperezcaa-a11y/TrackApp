-- ============================================================================
-- TrackApp · 0035_rate_limit_apis.sql  (auditoría — abuso de coste/DoS)
--   Las rutas /api/cp, /api/distance, /api/places solo exigían sesión: un usuario
--   en bucle podía agotar la cuota gratuita de GeoNames/OpenRouteService (DoS
--   funcional + coste). Se añade un rate-limiter GENÉRICO por usuario+bucket.
--   También se corrige la carrera TOCTOU de allow_ai_scan con un advisory lock.
-- ============================================================================

-- Eventos de uso de API (para el límite por ventana). Sin policies: acceso solo
-- vía la función SECURITY DEFINER (RLS activa = denegado a authenticated/anon).
create table if not exists public.api_rate_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  bucket     text not null,
  created_at timestamptz not null default now()
);
create index if not exists api_rate_events_uid_bucket_time
  on public.api_rate_events (user_id, bucket, created_at);
alter table public.api_rate_events enable row level security;

-- Límite genérico por usuario+bucket en ventana de 1 minuto. Devuelve true si se
-- permite la llamada (y la registra), false si se supera el tope.
create or replace function public.allow_api_call(
  p_bucket  text,
  p_per_min int default 30
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_cap   int  := least(greatest(coalesce(p_per_min, 30), 1), 120);  -- tope acotado
  v_count int;
begin
  if v_uid is null then
    return false;
  end if;
  -- Serializa por usuario+bucket dentro de la transacción: evita la carrera
  -- "contar-luego-insertar" (dos llamadas concurrentes colándose).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || coalesce(p_bucket, ''), 0));
  select count(*) into v_count from public.api_rate_events
    where user_id = v_uid and bucket = p_bucket and created_at > now() - interval '1 minute';
  if v_count >= v_cap then
    return false;
  end if;
  insert into public.api_rate_events(user_id, bucket) values (v_uid, p_bucket);
  return true;
end;
$$;

revoke all on function public.allow_api_call(text, int) from public;
grant execute on function public.allow_api_call(text, int) to authenticated;

-- ─── Arreglo TOCTOU en allow_ai_scan (mismo advisory lock) ───────────────────
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
  v_cap_min int := least(greatest(coalesce(p_per_min, 6), 1), 6);
  v_cap_day int := least(greatest(coalesce(p_per_day, 10), 1), 10);
begin
  if v_uid is null then
    return false;
  end if;
  -- Serializa por usuario para que ráfagas concurrentes no superen el tope.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':ai_scan', 0));
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
