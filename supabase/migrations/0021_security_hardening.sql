-- ============================================================================
-- TrackApp · 0021_security_hardening.sql  (defensa en profundidad)
-- Hallazgos de la auditoría ofensiva (ninguno crítico):
--   1) Las policies UPDATE de storage tenían USING pero no WITH CHECK: en teoría
--      permitirían mover un objeto propio a una ruta fuera de la carpeta del
--      usuario. Se añade WITH CHECK con la misma condición de carpeta.
--   2) allow_ai_scan exponía p_per_min/p_per_day y execute a authenticated: un
--      cliente podía llamarlo directamente con límites altos. No era explotable
--      (las rutas usan los valores por defecto), pero se clampan dentro del
--      cuerpo para que ninguna llamada pueda elevar el límite real (6/min,10/día).
-- ============================================================================

-- ─── 1) WITH CHECK en las policies UPDATE de storage ────────────────────────
drop policy if exists logos_update_own on storage.objects;
create policy logos_update_own on storage.objects
  for update using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recibos_update_own on storage.objects;
create policy recibos_update_own on storage.objects
  for update using (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'recibos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists facturas_update_own on storage.objects;
create policy facturas_update_own on storage.objects
  for update using (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 2) allow_ai_scan: clampar los límites dentro del cuerpo ─────────────────
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
  -- Límites reales acotados: ninguna llamada (ni directa) puede elevarlos.
  -- Fase de pruebas: 10 escaneos/día por usuario para controlar el coste de IA.
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
