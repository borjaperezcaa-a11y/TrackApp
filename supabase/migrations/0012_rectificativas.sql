-- ============================================================================
-- TrackApp · 0012_rectificativas.sql
-- Facturas rectificativas (subsanar errores SIN tocar la original):
--   - Una factura emitida es inmutable; un error se corrige con una factura
--     RECTIFICATIVA que la referencia (RD 1619/2012) y que se encadena con su
--     propia huella (forward-compatible con Verifactu, tipos R1-R5).
--   - MVP: rectificativa de ANULACIÓN (importes negados que dejan la original a
--     cero) + liberación de sus viajes a 'pendiente' para poder re-facturar.
-- ============================================================================

alter table public.invoices
  add column if not exists tipo         text not null default 'F1',   -- F1 normal, R1 rectificativa
  add column if not exists rectifica_id uuid references public.invoices(id),
  add column if not exists motivo       text;

-- Inmutabilidad: además de lo anterior, tipo/rectifica_id/motivo no cambian.
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
   or new.base              is distinct from old.base
   or new.iva_rate          is distinct from old.iva_rate
   or new.iva               is distinct from old.iva
   or new.irpf_rate         is distinct from old.irpf_rate
   or new.irpf              is distinct from old.irpf
   or new.total             is distinct from old.total
   or new.prev_hash         is distinct from old.prev_hash
   or new.huella            is distinct from old.huella
   or new.gen_ts            is distinct from old.gen_ts
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

-- ─── Emisión de rectificativa (anulación) ───────────────────────────────────
create or replace function public.emit_rectificativa(
  p_original_id uuid,
  p_motivo      text default null
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_orig      public.invoices;
  v_serie     text;
  v_anio      smallint;
  v_yy        text;
  v_num       int;
  v_chain     int;
  v_prev_hash text;
  v_base      numeric(12,2);
  v_iva       numeric(12,2);
  v_irpf      numeric(12,2);
  v_total     numeric(12,2);
  v_numero    text;
  v_gen_ts    timestamptz := now();
  v_gen_iso   text;
  v_nif       text;
  v_canonical text;
  v_huella    text;
  v_qr        text;
  v_inv       public.invoices;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  select * into v_orig from public.invoices where id = p_original_id and user_id = v_uid;
  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_orig.tipo <> 'F1' then
    raise exception 'Solo se pueden rectificar facturas normales';
  end if;
  if exists (select 1 from public.invoices where rectifica_id = p_original_id and user_id = v_uid) then
    raise exception 'Esta factura ya tiene una rectificativa';
  end if;

  v_serie := v_orig.serie;
  v_anio  := extract(year from v_gen_ts)::smallint;

  select coalesce(max(num), 0) + 1 into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;

  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));

  -- Anulación: importes negados (dejan la original a cero).
  v_base  := -v_orig.base;
  v_iva   := -v_orig.iva;
  v_irpf  := -v_orig.irpf;
  v_total := -v_orig.total;
  v_nif   := coalesce(v_orig.emisor_snapshot->>'nif', '');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || v_nif ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
       '&TipoFactura=R1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || v_nif ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot, tipo, rectifica_id, motivo)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, v_orig.client_id, v_gen_ts::date, v_orig.forma_pago,
    v_base, v_orig.iva_rate, v_iva, v_orig.irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_orig.emisor_snapshot, v_orig.cliente_snapshot, 'R1', p_original_id, p_motivo)
  returning * into v_inv;

  -- Líneas negadas (copia de la original, sin enlazar al viaje).
  insert into public.invoice_lines (
    user_id, invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe, orden)
  select v_uid, v_inv.id, null, l.fecha, l.origen, l.destino, l.cantidad, -l.precio, -l.importe, l.orden
  from public.invoice_lines l where l.invoice_id = p_original_id;

  -- Liberar los viajes de la original para poder re-facturarlos.
  update public.trips set estado = 'pendiente', invoice_id = null
    where invoice_id = p_original_id and user_id = v_uid;

  update public.profiles set contador = v_chain where user_id = v_uid;

  return v_inv;
end;
$$;

revoke all on function public.emit_rectificativa(uuid, text) from public;
grant execute on function public.emit_rectificativa(uuid, text) to authenticated;
