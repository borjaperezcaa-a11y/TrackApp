-- ============================================================================
-- TrackApp · 0014_descripcion_porte.sql
-- Descripción del porte (peso/tonelaje/tipo de carga) en el viaje, que se
-- arrastra a la línea de la factura. Se recrean las 3 funciones de emisión para
-- transportar el campo `descripcion`.
-- ============================================================================

alter table public.trips         add column if not exists descripcion text;
alter table public.invoice_lines add column if not exists descripcion text;

-- ─── emit_invoice_from_trips (con descripción) ──────────────────────────────
create or replace function public.emit_invoice_from_trips(
  p_client_id  uuid,
  p_trip_ids   uuid[],
  p_iva_rate   numeric default null,
  p_irpf_rate  numeric default null,
  p_fecha      date    default current_date,
  p_forma_pago text    default 'Transferencia',
  p_lines      jsonb   default null,
  p_emisor     jsonb   default null,
  p_cliente    jsonb   default null
) returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles;
  v_client    public.clients;
  v_serie     text;
  v_anio      smallint := extract(year from p_fecha)::smallint;
  v_yy        text;
  v_num       int;
  v_chain     int;
  v_prev_hash text;
  v_iva_rate  numeric;
  v_irpf_rate numeric;
  v_base      numeric(12,2);
  v_iva       numeric(12,2);
  v_irpf      numeric(12,2);
  v_total     numeric(12,2);
  v_numero    text;
  v_gen_ts    timestamptz := now();
  v_gen_iso   text;
  v_emisor    jsonb;
  v_cliente   jsonb;
  v_huella    text;
  v_canonical text;
  v_qr        text;
  v_invoice   public.invoices;
  v_line      jsonb;
  v_orden     int := 0;
  v_lines     jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then raise exception 'Perfil no encontrado'; end if;

  if p_trip_ids is null or array_length(p_trip_ids, 1) is null then
    raise exception 'No hay viajes seleccionados';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_uid;
  if not found then raise exception 'Cliente no válido'; end if;

  v_serie     := coalesce(v_profile.serie, 'FACT');
  v_iva_rate  := coalesce(p_iva_rate,  v_profile.iva_def,  21);
  v_irpf_rate := coalesce(p_irpf_rate, v_profile.irpf_def, 1);

  if exists (
    select 1 from unnest(p_trip_ids) as tid
    left join public.trips t on t.id = tid and t.user_id = v_uid
    where t.id is null or t.estado <> 'pendiente' or t.client_id is distinct from p_client_id
  ) then
    raise exception 'Algún viaje no es válido (inexistente, ya facturado o de otro cliente)';
  end if;

  if p_lines is not null then
    v_lines := p_lines;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
              'trip_id', t.id, 'fecha', t.fecha, 'origen', t.origen, 'destino', t.destino,
              'descripcion', t.descripcion, 'cantidad', 1, 'precio', t.importe
            ) order by t.fecha, t.created_at), '[]'::jsonb)
      into v_lines
      from public.trips t where t.id = any(p_trip_ids) and t.user_id = v_uid;
  end if;

  select coalesce(max(num), 0) + 1 into v_num
    from public.invoices where user_id = v_uid and serie = v_serie and anio = v_anio;
  select coalesce(max(chain_index), 0) + 1 into v_chain
    from public.invoices where user_id = v_uid;
  select huella into v_prev_hash
    from public.invoices where user_id = v_uid and chain_index = v_chain - 1;

  v_yy     := lpad((v_anio % 100)::text, 2, '0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text, 2, '0'));

  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_base from jsonb_array_elements(v_lines) l;
  v_base  := round(v_base, 2);
  v_iva   := round(v_base * v_iva_rate  / 100, 2);
  v_irpf  := round(v_base * v_irpf_rate / 100, 2);
  v_total := v_base + v_iva - v_irpf;

  v_emisor := jsonb_build_object(
    'nombre', v_profile.nombre, 'nif', v_profile.nif, 'direccion', v_profile.direccion,
    'cp_localidad', v_profile.cp_localidad, 'iban', v_profile.iban,
    'logo_url', v_profile.logo_url, 'serie', v_serie);
  v_cliente := jsonb_build_object(
    'nombre', v_client.nombre, 'nif', v_client.nif, 'direccion', v_client.direccion,
    'cp_localidad', v_client.cp_localidad, 'condiciones_pago', v_client.condiciones_pago);

  if coalesce(btrim(v_emisor->>'nombre'), '') = '' or coalesce(btrim(v_emisor->>'nif'), '') = '' then
    raise exception 'Completa tus datos de emisor (nombre y NIF) en Mis datos antes de emitir facturas';
  end if;

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical :=
       'IDEmisorFactura='          || coalesce(v_emisor->>'nif', '') ||
       '&NumSerieFactura='         || v_numero ||
       '&FechaExpedicionFactura='  || to_char(p_fecha, 'DD-MM-YYYY') ||
       '&TipoFactura=F1' ||
       '&CuotaTotal='              || to_char(v_iva,   'FM9999999990.00') ||
       '&ImporteTotal='            || to_char(v_total, 'FM9999999990.00') ||
       '&Huella='                  || coalesce(v_prev_hash, '') ||
       '&FechaHoraHusoGenRegistro=' || v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=' || coalesce(v_emisor->>'nif', '') ||
          '&numserie=' || v_numero || '&fecha=' || to_char(p_fecha, 'DD-MM-YYYY') ||
          '&importe='  || to_char(v_total, 'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, p_client_id, p_fecha, p_forma_pago,
    v_base, v_iva_rate, v_iva, v_irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_emisor, v_cliente)
  returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.invoice_lines (
      user_id, invoice_id, trip_id, fecha, origen, destino, descripcion, cantidad, precio, importe, orden)
    values (
      v_uid, v_invoice.id,
      nullif(v_line->>'trip_id', '')::uuid,
      nullif(v_line->>'fecha', '')::date,
      v_line->>'origen', v_line->>'destino', v_line->>'descripcion',
      coalesce((v_line->>'cantidad')::numeric, 1),
      (v_line->>'precio')::numeric,
      round(coalesce((v_line->>'cantidad')::numeric, 1) * (v_line->>'precio')::numeric, 2),
      v_orden);
    v_orden := v_orden + 1;
  end loop;

  update public.trips set estado = 'facturado', invoice_id = v_invoice.id
    where id = any(p_trip_ids) and user_id = v_uid;
  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_invoice;
end;
$$;

-- ─── emit_rectificativa: copia la descripción de la original ─────────────────
create or replace function public.emit_rectificativa(p_original_id uuid, p_motivo text default null)
returns public.invoices language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid(); v_profile public.profiles; v_orig public.invoices;
  v_serie text; v_anio smallint; v_yy text; v_num int; v_chain int; v_prev_hash text;
  v_base numeric(12,2); v_iva numeric(12,2); v_irpf numeric(12,2); v_total numeric(12,2);
  v_numero text; v_gen_ts timestamptz := now(); v_gen_iso text; v_nif text;
  v_canonical text; v_huella text; v_qr text; v_inv public.invoices;
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

  v_serie := v_orig.serie; v_anio := extract(year from v_gen_ts)::smallint;
  select coalesce(max(num),0)+1 into v_num from public.invoices where user_id=v_uid and serie=v_serie and anio=v_anio;
  select coalesce(max(chain_index),0)+1 into v_chain from public.invoices where user_id=v_uid;
  select huella into v_prev_hash from public.invoices where user_id=v_uid and chain_index=v_chain-1;
  v_yy := lpad((v_anio%100)::text,2,'0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text,2,'0'));

  v_base := -v_orig.base; v_iva := -v_orig.iva; v_irpf := -v_orig.irpf; v_total := -v_orig.total;
  v_nif := coalesce(v_orig.emisor_snapshot->>'nif','');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical := 'IDEmisorFactura='||v_nif||'&NumSerieFactura='||v_numero||
    '&FechaExpedicionFactura='||to_char(v_gen_ts::date,'DD-MM-YYYY')||'&TipoFactura=R1'||
    '&CuotaTotal='||to_char(v_iva,'FM9999999990.00')||'&ImporteTotal='||to_char(v_total,'FM9999999990.00')||
    '&Huella='||coalesce(v_prev_hash,'')||'&FechaHoraHusoGenRegistro='||v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical,'UTF8'),'sha256'),'hex'));
  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif='||v_nif||'&numserie='||v_numero||
    '&fecha='||to_char(v_gen_ts::date,'DD-MM-YYYY')||'&importe='||to_char(v_total,'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot, tipo, rectifica_id, motivo)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, v_orig.client_id, v_gen_ts::date, v_orig.forma_pago,
    v_base, v_orig.iva_rate, v_iva, v_orig.irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_orig.emisor_snapshot, v_orig.cliente_snapshot, 'R1', p_original_id, p_motivo)
  returning * into v_inv;

  insert into public.invoice_lines (
    user_id, invoice_id, trip_id, fecha, origen, destino, descripcion, cantidad, precio, importe, orden)
  select v_uid, v_inv.id, null, l.fecha, l.origen, l.destino, l.descripcion, l.cantidad, -l.precio, -l.importe, l.orden
  from public.invoice_lines l where l.invoice_id = p_original_id;

  update public.trips set estado='pendiente', invoice_id=null where invoice_id = p_original_id and user_id = v_uid;
  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_inv;
end; $$;

-- ─── emit_rectificativa_dif: conserva la descripción de la original ──────────
create or replace function public.emit_rectificativa_dif(p_original_id uuid, p_lines jsonb, p_motivo text default null)
returns public.invoices language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid(); v_profile public.profiles; v_orig public.invoices;
  v_orig_n int; v_corr_n int;
  v_corr_base numeric(12,2); v_corr_iva numeric(12,2); v_corr_irpf numeric(12,2); v_corr_total numeric(12,2);
  v_base numeric(12,2); v_iva numeric(12,2); v_irpf numeric(12,2); v_total numeric(12,2);
  v_serie text; v_anio smallint; v_yy text; v_num int; v_chain int; v_prev_hash text;
  v_numero text; v_gen_ts timestamptz := now(); v_gen_iso text; v_nif text;
  v_canonical text; v_huella text; v_qr text; v_inv public.invoices;
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
  select count(*) into v_corr_n from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb));
  if v_corr_n <> v_orig_n then raise exception 'Las líneas corregidas no cuadran con la factura'; end if;

  select coalesce(sum((l->>'cantidad')::numeric*(l->>'precio')::numeric),0) into v_corr_base from jsonb_array_elements(p_lines) l;
  v_corr_base := round(v_corr_base,2);
  v_corr_iva := round(v_corr_base * v_orig.iva_rate/100, 2);
  v_corr_irpf := round(v_corr_base * v_orig.irpf_rate/100, 2);
  v_corr_total := v_corr_base + v_corr_iva - v_corr_irpf;
  v_base := v_corr_base - v_orig.base; v_iva := v_corr_iva - v_orig.iva;
  v_irpf := v_corr_irpf - v_orig.irpf; v_total := v_corr_total - v_orig.total;
  if v_base = 0 and v_iva = 0 and v_irpf = 0 then raise exception 'No hay cambios de importe que rectificar'; end if;

  v_serie := v_orig.serie; v_anio := extract(year from v_gen_ts)::smallint;
  select coalesce(max(num),0)+1 into v_num from public.invoices where user_id=v_uid and serie=v_serie and anio=v_anio;
  select coalesce(max(chain_index),0)+1 into v_chain from public.invoices where user_id=v_uid;
  select huella into v_prev_hash from public.invoices where user_id=v_uid and chain_index=v_chain-1;
  v_yy := lpad((v_anio%100)::text,2,'0');
  v_numero := format('%s/%s-%s', v_serie, v_yy, lpad(v_num::text,2,'0'));
  v_nif := coalesce(v_orig.emisor_snapshot->>'nif','');

  v_gen_iso := to_char(v_gen_ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_canonical := 'IDEmisorFactura='||v_nif||'&NumSerieFactura='||v_numero||
    '&FechaExpedicionFactura='||to_char(v_gen_ts::date,'DD-MM-YYYY')||'&TipoFactura=R1'||
    '&CuotaTotal='||to_char(v_iva,'FM9999999990.00')||'&ImporteTotal='||to_char(v_total,'FM9999999990.00')||
    '&Huella='||coalesce(v_prev_hash,'')||'&FechaHoraHusoGenRegistro='||v_gen_iso;
  v_huella := upper(encode(extensions.digest(convert_to(v_canonical,'UTF8'),'sha256'),'hex'));
  v_qr := 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif='||v_nif||'&numserie='||v_numero||
    '&fecha='||to_char(v_gen_ts::date,'DD-MM-YYYY')||'&importe='||to_char(v_total,'FM9999999990.00');

  insert into public.invoices (
    user_id, numero, serie, anio, num, chain_index, client_id, fecha, forma_pago,
    base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, gen_ts, qr,
    emisor_snapshot, cliente_snapshot, tipo, rectifica_id, motivo)
  values (
    v_uid, v_numero, v_serie, v_anio, v_num, v_chain, v_orig.client_id, v_gen_ts::date, v_orig.forma_pago,
    v_base, v_orig.iva_rate, v_iva, v_orig.irpf_rate, v_irpf, v_total, v_prev_hash, v_huella, v_gen_ts, v_qr,
    v_orig.emisor_snapshot, v_orig.cliente_snapshot, 'R1', p_original_id, p_motivo)
  returning * into v_inv;

  insert into public.invoice_lines (
    user_id, invoice_id, trip_id, fecha, origen, destino, descripcion, cantidad, precio, importe, orden)
  select v_uid, v_inv.id, null, o.fecha, o.origen, o.destino, o.descripcion, o.cantidad,
         (l->>'precio')::numeric - o.precio,
         round(o.cantidad * ((l->>'precio')::numeric - o.precio), 2), o.orden
  from jsonb_array_elements(p_lines) with ordinality as t(l, idx)
  join public.invoice_lines o on o.invoice_id = p_original_id and o.orden = (idx-1)::int
  where (l->>'precio')::numeric <> o.precio;

  update public.profiles set contador = v_chain where user_id = v_uid;
  return v_inv;
end; $$;
