-- ============================================================================
-- TrackApp · 0034_seguridad_trips_e_inmutabilidad.sql  (auditoría de seguridad)
--   Cierra dos hallazgos de la auditoría (ambos defensa a nivel de BD, no solo app):
--
--   ★A1 (ALTO) — Re-facturación de portes ya facturados. La regla "un porte
--      facturado no se re-factura" vivía SOLO en las server actions. Como la clave
--      anónima es pública, un usuario podía llamar al cliente Supabase directo y
--      hacer `update trips set estado='pendiente', invoice_id=null` (RLS lo permite,
--      es su fila) y luego volver a emitir → doble facturación del mismo porte.
--      Fix: trigger que impide a los roles de PostgREST (authenticated/anon) cambiar
--      `estado`/`invoice_id` de un porte. Solo las funciones SECURITY DEFINER (que
--      corren como el owner: emit_invoice_from_trips, emit_rectificativa*) pueden
--      hacerlo. La app nunca toca esos campos directamente (solo en el INSERT).
--
--   ★ Inmutabilidad — `forma_pago` y `qr` no estaban en enforce_invoice_immutable
--      (solo protegidos por el grant de columna). Se añaden por defensa en
--      profundidad: una factura emitida no debe cambiar su forma de pago ni su QR.
-- ============================================================================

-- ─── Trigger anti re-facturación en trips ───────────────────────────────────
create or replace function public.enforce_trip_billing_state()
returns trigger language plpgsql as $$
begin
  -- Solo el sistema (funciones SECURITY DEFINER, que corren como el owner) puede
  -- cambiar el estado de facturación de un porte. Un usuario vía PostgREST (rol
  -- authenticated/anon) NO puede tocar estado/invoice_id directamente.
  if current_user in ('authenticated', 'anon')
     and (new.estado is distinct from old.estado
          or new.invoice_id is distinct from old.invoice_id) then
    raise exception 'El estado de facturación de un porte solo lo gestiona el sistema (emisión/rectificativa).';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_billing_state on public.trips;
create trigger trips_billing_state
  before update on public.trips
  for each row execute function public.enforce_trip_billing_state();

-- ─── Inmutabilidad de factura: añadir forma_pago y qr ───────────────────────
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
   or new.forma_pago        is distinct from old.forma_pago   -- ★ añadido
   or new.base              is distinct from old.base
   or new.iva_rate          is distinct from old.iva_rate
   or new.iva               is distinct from old.iva
   or new.irpf_rate         is distinct from old.irpf_rate
   or new.irpf              is distinct from old.irpf
   or new.total             is distinct from old.total
   or new.prev_hash         is distinct from old.prev_hash
   or new.huella            is distinct from old.huella
   or new.gen_ts            is distinct from old.gen_ts
   or new.qr                is distinct from old.qr           -- ★ añadido
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
