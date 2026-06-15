-- ============================================================================
-- TrackApp · 0018_rectifica_unico.sql
-- Garantía a nivel de BD de que una factura solo puede ser rectificada/anulada
-- UNA vez. Las funciones emit_rectificativa(_dif) ya lo comprueban con un
-- `if exists`, pero ese chequeo es vulnerable a una carrera entre dos emisiones
-- simultáneas. Un índice único parcial lo blinda: el segundo INSERT con el
-- mismo rectifica_id falla en la propia base de datos.
--
-- rectifica_id es el id (UUID global) de la factura original → único en toda la
-- tabla cuando no es null.
-- ============================================================================

create unique index if not exists invoices_rectifica_id_unico
  on public.invoices (rectifica_id)
  where rectifica_id is not null;
