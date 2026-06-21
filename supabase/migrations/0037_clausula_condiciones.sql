-- ============================================================================
-- TrackApp · 0037_clausula_condiciones.sql
--   Cláusula de condiciones configurable por usuario. Hasta ahora el texto
--   "La presente factura se entenderá aceptada..." salía FIJO en todas las
--   facturas. Ahora cada usuario decide si la incluye y con qué texto.
--
--   Es una nota COMERCIAL (no fiscal): no entra en la huella ni en el registro
--   Verifactu; solo se imprime en el PDF. Por eso se lee del perfil al generar
--   el PDF (no se congela en el snapshot ni toca el motor de emisión).
-- ============================================================================

alter table public.profiles
  add column if not exists clausula_activa boolean not null default true,
  add column if not exists clausula_texto  text;

-- Backfill: el texto estándar que hasta ahora salía fijo, para no cambiar el
-- comportamiento de quien ya facturaba (puede editarlo o desactivarlo luego).
update public.profiles
   set clausula_texto = 'La presente factura se entenderá aceptada en el momento de su cobro salvo que de forma expresa sea rechazada en el plazo de 15 días contados desde su recepción.'
 where clausula_texto is null;

-- Por si profiles usa grants por columna (no solo RLS): permitir leer/actualizar
-- las nuevas columnas al rol de la app. Inofensivo si ya hay grant de tabla.
grant select (clausula_activa, clausula_texto) on public.profiles to authenticated;
grant update (clausula_activa, clausula_texto) on public.profiles to authenticated;
