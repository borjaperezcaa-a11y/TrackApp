-- ============================================================================
-- TrackApp · borrar_datos_cuenta.sql  (MANTENIMIENTO — NO es una migración)
--
--   Borra TODOS los datos de UNA cuenta (facturas, viajes, portes, gastos,
--   ingresos, externas y eventos), dejando la cuenta y el perfil intactos.
--   Pensado para limpiar durante las PRUEBAS.
--
--   ⚠️ IRREVERSIBLE. Las facturas son inmutables por diseño (trigger Verifactu);
--   este script desactiva ese candado SOLO durante el borrado y lo reactiva.
--   Si algo falla, toda la operación se deshace (rollback) y el candado vuelve.
--
--   USO: Supabase → SQL Editor → pega esto → cambia el email → Run.
-- ============================================================================

do $$
declare
  uid uuid;
begin
  -- 1) Tu email de ACCESO a la app (con el que inicias sesión):
  select id into uid from auth.users where email = 'PON_AQUI_TU_EMAIL';
  if uid is null then
    raise exception 'No encuentro ningún usuario con ese email. Revísalo.';
  end if;

  -- 2) Desactivar candados de inmutabilidad (facturas / eventos) solo para esta limpieza.
  alter table public.invoices      disable trigger user;
  alter table public.invoice_lines disable trigger user;
  alter table public.system_events disable trigger user;

  -- 3) Borrado en orden de dependencias (hijos antes que padres).
  delete from public.invoice_lines     where user_id = uid;
  delete from public.invoices          where user_id = uid;
  delete from public.expenses          where user_id = uid;
  delete from public.trips             where user_id = uid;   -- portes
  delete from public.viajes            where user_id = uid;   -- viajes físicos
  delete from public.external_invoices where user_id = uid;
  delete from public.incomes           where user_id = uid;
  delete from public.system_events     where user_id = uid;
  delete from public.ai_scan_events    where user_id = uid;

  -- Clientes: por defecto SE CONSERVAN. Descomenta la línea para borrarlos también:
  -- delete from public.clients        where user_id = uid;

  -- 4) Reiniciar el contador de la cadena de facturas (la numeración empieza de cero).
  update public.profiles set contador = 0 where user_id = uid;

  -- 5) Reactivar los candados.
  alter table public.invoices      enable trigger user;
  alter table public.invoice_lines enable trigger user;
  alter table public.system_events enable trigger user;

  raise notice 'Datos borrados para el usuario %', uid;
end $$;
