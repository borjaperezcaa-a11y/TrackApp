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
