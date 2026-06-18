-- ============================================================================
-- TrackApp · 0033_rectificativas_importe_total_sin_irpf.sql  (FAQ AEAT nº20)
--   Completa el arreglo de la 0032 en las RECTIFICATIVAS: el `ImporteTotal` de la
--   huella y el `importe` del QR deben ser base + IVA (SIN restar IRPF). Hasta
--   ahora emit_rectificativa (0012) y emit_rectificativa_dif (0013) usaban el
--   `v_total` (con IRPF) también en huella/QR.
--
--   Fix: se separa v_importe_total = base+IVA (huella+QR) del v_total = base+IVA−IRPF
--   (que se sigue guardando en la columna `total`). Idénticas a 0012/0013 en todo
--   lo demás. La verificación del badge en cliente ya tolera ambas fórmulas (commit
--   7939d3b), así que las rectificativas antiguas y nuevas siguen mostrando la cadena
--   íntegra.
-- ============================================================================

-- ─── Rectificativa de ANULACIÓN ─────────────────────────────────────────────
create or replace function public.emit_rectificativa(
  p_original_id uuid,
  p_motivo      text default null
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid           uuid := auth.uid();
  v_profile       public.profiles;
  v_orig          public.invoices;
  v_serie         text;
  v_anio          smallint;
  v_yy            text;
  v_num           int;
  v_chain         int;
  v_prev_hash     text;
  v_base          numeric(12,2);
  v_iva           numeric(12,2);
  v_irpf          numeric(12,2);
  v_total         numeric(12,2);
  v_importe_total numeric(12,2);   -- ★FAQ20: base + IVA (ImporteTotal del registro)
  v_numero        text;
  v_gen_ts        timestamptz := now();
  v_gen_iso       text;
  v_nif           text;
  v_canonical     text;
  v_huella        text;
  v_qr            text;
  v_inv           public.invoices;
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
  v_base          := -v_orig.base;
  v_iva           := -v_orig.iva;
  v_irpf          := -v_orig.irpf;
  v_total         := -v_orig.total;       -- total a pagar negado (columna `total`)
  v_importe_total := v_base + v_iva;       -- ★FAQ20: base + IVA (sin IRPF)
  v_nif   := coalesce(v_orig.emisor_snapshot->>'nif', '');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || v_nif ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
       '&TipoFactura=R1' ||
       '&CuotaTotal='              || to_char(v_iva,           'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_importe_total, 'FM9999999990.00') ||   -- ★FAQ20
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || v_nif ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_importe_total, 'FM9999999990.00');   -- ★FAQ20

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

-- ─── Rectificativa POR DIFERENCIAS ──────────────────────────────────────────
create or replace function public.emit_rectificativa_dif(
  p_original_id uuid,
  p_lines       jsonb,            -- líneas corregidas [{cantidad, precio}] en el MISMO orden
  p_motivo      text default null
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid           uuid := auth.uid();
  v_profile       public.profiles;
  v_orig          public.invoices;
  v_orig_n        int;
  v_corr_n        int;
  v_corr_base     numeric(12,2);
  v_corr_iva      numeric(12,2);
  v_corr_irpf     numeric(12,2);
  v_corr_total    numeric(12,2);
  v_base          numeric(12,2);
  v_iva           numeric(12,2);
  v_irpf          numeric(12,2);
  v_total         numeric(12,2);
  v_importe_total numeric(12,2);   -- ★FAQ20: base + IVA (ImporteTotal del registro)
  v_serie         text;
  v_anio          smallint;
  v_yy            text;
  v_num           int;
  v_chain         int;
  v_prev_hash     text;
  v_numero        text;
  v_gen_ts        timestamptz := now();
  v_gen_iso       text;
  v_nif           text;
  v_canonical     text;
  v_huella        text;
  v_qr            text;
  v_inv           public.invoices;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then raise exception 'Perfil no encontrado'; end if;

  select * into v_orig from public.invoices where id = p_original_id and user_id = v_uid;
  if not found then raise exception 'Factura no encontrada'; end if;
  if v_orig.tipo <> 'F1' then raise exception 'Solo se pueden rectificar facturas normales'; end if;
  if exists (select 1 from public.invoices where rectifica_id = p_original_id and user_id = v_uid) then
    raise exception 'Esta factura ya tiene una rectificativa';
  end if;

  select count(*) into v_orig_n from public.invoice_lines where invoice_id = p_original_id;
  select count(*) into v_corr_n from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb));
  if v_corr_n <> v_orig_n then
    raise exception 'Las líneas corregidas no cuadran con la factura';
  end if;

  -- Importes corregidos (con los tipos de IVA/IRPF de la original).
  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_corr_base from jsonb_array_elements(p_lines) l;
  v_corr_base  := round(v_corr_base, 2);
  v_corr_iva   := round(v_corr_base * v_orig.iva_rate  / 100, 2);
  v_corr_irpf  := round(v_corr_base * v_orig.irpf_rate / 100, 2);
  v_corr_total := v_corr_base + v_corr_iva - v_corr_irpf;

  -- Diferencias (lo que va en la rectificativa).
  v_base          := v_corr_base  - v_orig.base;
  v_iva           := v_corr_iva   - v_orig.iva;
  v_irpf          := v_corr_irpf  - v_orig.irpf;
  v_total         := v_corr_total - v_orig.total;   -- total a pagar (columna `total`)
  v_importe_total := v_base + v_iva;                 -- ★FAQ20: base + IVA (sin IRPF)

  if v_base = 0 and v_iva = 0 and v_irpf = 0 then
    raise exception 'No hay cambios de importe que rectificar';
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
  v_nif    := coalesce(v_orig.emisor_snapshot->>'nif', '');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || v_nif ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
       '&TipoFactura=R1' ||
       '&CuotaTotal='              || to_char(v_iva,           'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_importe_total, 'FM9999999990.00') ||   -- ★FAQ20
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || v_nif ||
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(v_gen_ts::date, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_importe_total, 'FM9999999990.00');   -- ★FAQ20

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot, tipo, rectifica_id, motivo)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, v_orig.client_id, v_gen_ts::date, v_orig.forma_pago,
    v_base, v_orig.iva_rate, v_iva, v_orig.irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_orig.emisor_snapshot, v_orig.cliente_snapshot, 'R1', p_original_id, p_motivo)
  returning * into v_inv;

  -- Líneas = diferencia por línea (mismo orden), solo las que cambian de precio.
  insert into public.invoice_lines (
    user_id, invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe, orden)
  select
    v_uid, v_inv.id, null, o.fecha, o.origen, o.destino, o.cantidad,
    (l->>'precio')::numeric - o.precio,
    round(o.cantidad * ((l->>'precio')::numeric - o.precio), 2),
    o.orden
  from jsonb_array_elements(p_lines) with ordinality as t(l, idx)
  join public.invoice_lines o on o.invoice_id = p_original_id and o.orden = (idx - 1)::int
  where (l->>'precio')::numeric <> o.precio;

  -- La original sigue válida; no se anula ni se liberan viajes.
  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_inv;
end;
$$;

revoke all on function public.emit_rectificativa_dif(uuid, jsonb, text) from public;
grant execute on function public.emit_rectificativa_dif(uuid, jsonb, text) to authenticated;
