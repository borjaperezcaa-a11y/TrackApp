-- ============================================================================
-- TrackApp · 0036_blindaje_fiscal_auditoria.sql  (auditoría — blindaje extra)
--   Tres mejoras de defensa en profundidad detectadas en la auditoría:
--
--   1) Inmutabilidad de invoice_lines por TRIGGER (hoy solo por `revoke`). Igual
--      que invoices/trips: los roles de PostgREST (authenticated/anon) no pueden
--      modificar ni borrar líneas de una factura emitida. Solo el sistema
--      (funciones SECURITY DEFINER, que corren como owner) las escribe en el INSERT.
--
--   2) Anti-borrado de invoices por TRIGGER. La inmutabilidad cubría UPDATE pero
--      no DELETE (frenado solo por `revoke delete`). Se añade un trigger que impide
--      a authenticated/anon borrar facturas (rompería el correlativo y la cadena).
--
--   3) "Suelo" de numeración (num_inicial) en las RECTIFICATIVAS. El alta ya lo
--      aplica (0030); las rectificativas tomaban max(num)+1 sin el suelo, de modo
--      que si la 1ª operación de un año nuevo fuese una rectificativa de una factura
--      del año anterior, podía desalinearse el correlativo. Se aplica el mismo
--      bloque que el alta. (Idénticas a 0033 en TODO lo demás.)
-- ============================================================================

-- ─── 1) Inmutabilidad de invoice_lines ──────────────────────────────────────
create or replace function public.enforce_invoice_lines_immutable()
returns trigger language plpgsql as $$
begin
  -- Solo el sistema (funciones SECURITY DEFINER, que corren como el owner) escribe
  -- líneas, y solo en el INSERT. Un usuario vía PostgREST (authenticated/anon) NO
  -- puede modificar ni borrar líneas de una factura ya emitida.
  if current_user in ('authenticated', 'anon') then
    raise exception 'Las líneas de una factura emitida son inmutables.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_lines_immutable on public.invoice_lines;
create trigger invoice_lines_immutable
  before update or delete on public.invoice_lines
  for each row execute function public.enforce_invoice_lines_immutable();

-- ─── 2) Anti-borrado de invoices ────────────────────────────────────────────
create or replace function public.enforce_invoice_no_delete()
returns trigger language plpgsql as $$
begin
  -- Una factura emitida no se borra (rompería el correlativo y la cadena de
  -- huellas). Las rectificativas/anulaciones se hacen emitiendo otro registro.
  if current_user in ('authenticated', 'anon') then
    raise exception 'Una factura emitida no se puede borrar; emite una rectificativa de anulación.';
  end if;
  return old;
end;
$$;

drop trigger if exists invoices_no_delete on public.invoices;
create trigger invoices_no_delete
  before delete on public.invoices
  for each row execute function public.enforce_invoice_no_delete();

-- ─── 3a) Rectificativa de ANULACIÓN — con suelo de numeración ────────────────
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

  -- Correlativo con "suelo" de migración (coherente con el alta, 0030).
  select coalesce(max(num), 0) into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  if v_profile.num_inicial is not null
     and v_profile.num_inicial_anio = v_anio
     and v_profile.num_inicial_serie = v_serie then
    v_num := greatest(v_num, v_profile.num_inicial);
  end if;
  v_num := v_num + 1;

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

-- ─── 3b) Rectificativa POR DIFERENCIAS — con suelo de numeración ─────────────
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

  -- Correlativo con "suelo" de migración (coherente con el alta, 0030).
  select coalesce(max(num), 0) into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  if v_profile.num_inicial is not null
     and v_profile.num_inicial_anio = v_anio
     and v_profile.num_inicial_serie = v_serie then
    v_num := greatest(v_num, v_profile.num_inicial);
  end if;
  v_num := v_num + 1;

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
