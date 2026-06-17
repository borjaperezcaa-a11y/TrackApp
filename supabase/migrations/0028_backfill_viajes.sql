-- ============================================================================
-- TrackApp · 0028_backfill_viajes.sql  (Fase 2 — datos)
--   Convierte cada porte suelto (trip con viaje_id NULL) en un VIAJE FÍSICO con
--   ese único porte dentro, copiando fecha/ruta/km. Así la lista de viajes pasa
--   a mostrarlos todos de forma uniforme. Idempotente: solo toca los que faltan.
-- ============================================================================

do $$
declare
  r record;
  v_id uuid;
begin
  for r in select * from public.trips where viaje_id is null loop
    insert into public.viajes (user_id, fecha, origen, destino, km, created_at)
      values (r.user_id, r.fecha, r.origen, r.destino, r.km, r.created_at)
      returning id into v_id;
    update public.trips set viaje_id = v_id where id = r.id;
  end loop;
end $$;
