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
