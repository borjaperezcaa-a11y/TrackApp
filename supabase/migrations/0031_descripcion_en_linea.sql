-- ============================================================================
-- TrackApp · 0031_descripcion_en_linea.sql  (feature — concepto de la línea)
--   La descripción del porte (`trips.descripcion`) no llegaba a `invoice_lines`:
--   las redefiniciones 0017/0025/0030 de emit_invoice_from_trips omitían la
--   columna `descripcion` en el insert (existe desde 0014 pero quedaba a null).
--
--   Ahora el asistente puede, OPCIONALMENTE, enviar la descripción por línea
--   (cuando el usuario activa "mostrar descripción en la factura"). Esta función:
--     - guarda `descripcion` en cada `invoice_lines` (desde p_lines, vacío→null);
--     - en la derivación automática (sin p_lines) usa `t.descripcion`.
--   El PDF la muestra como concepto debajo de la ruta solo si viene informada.
--
--   Idéntica a 0030 (mantiene el suelo num_inicial ★C1 y la validación ★M1);
--   el único cambio es añadir `descripcion` a la derivación y al insert (★D).
-- ============================================================================

create or replace function public.emit_invoice_from_trips(
  p_client_id  uuid,
  p_trip_ids   uuid[],
  p_iva_rate   numeric default null,
  p_irpf_rate  numeric default null,
  p_fecha      date    default current_date,
  p_forma_pago text    default 'Transferencia',
  p_lines      jsonb   default null,
  p_emisor     jsonb   default null,   -- IGNORADO (se usa el perfil del servidor)
  p_cliente    jsonb   default null    -- IGNORADO (se usa la ficha del cliente)
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
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  if p_trip_ids is null or array_length(p_trip_ids, 1) is null then
    raise exception 'No hay viajes seleccionados';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_uid;
  if not found then
    raise exception 'Cliente no válido';
  end if;

  v_serie     := coalesce(v_profile.serie, 'FACT');
  v_iva_rate  := coalesce(p_iva_rate,  v_profile.iva_def,  21);
  v_irpf_rate := coalesce(p_irpf_rate, v_profile.irpf_def, 1);

  if exists (
    select 1
    from unnest(p_trip_ids) as tid
    left join public.trips t on t.id = tid and t.user_id = v_uid
    where t.id is null
       or t.estado <> 'pendiente'
       or t.client_id is distinct from p_client_id
  ) then
    raise exception 'Algún viaje no es válido (inexistente, ya facturado o de otro cliente)';
  end if;

  -- Líneas (precios editables del porte). Si se pasan, deben corresponder a los
  -- viajes seleccionados; si no, se derivan de los viajes.
  if p_lines is not null then
    v_lines := p_lines;

    -- ★M1 (de 0025): validar que las líneas no falsean los importes que entran
    -- en la huella. Cada línea debe apuntar a un viaje SELECCIONADO (ya validado
    -- como propio y pendiente) y tener cantidad > 0 y precio ≥ 0.
    if exists (
      select 1
      from jsonb_array_elements(v_lines) l
      where nullif(l->>'trip_id', '') is null
         or (l->>'trip_id')::uuid <> all(p_trip_ids)
         or coalesce((l->>'precio')::numeric, -1) < 0
         or coalesce((l->>'cantidad')::numeric, 0) <= 0
    ) then
      raise exception 'Líneas de factura no válidas (no corresponden a los viajes seleccionados)';
    end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
              'trip_id',  t.id, 'fecha', t.fecha, 'origen', t.origen,
              'destino',  t.destino, 'cantidad', 1, 'precio', t.importe,
              'descripcion', t.descripcion                        -- ★D
            ) order by t.fecha, t.created_at), '[]'::jsonb)
      into v_lines
      from public.trips t
      where t.id = any(p_trip_ids) and t.user_id = v_uid;
  end if;

  -- Siguiente correlativo: max(num) de la (serie, año). Con "suelo" de migración
  -- (de 0017) si el usuario fijó el número de su última factura para esta serie
  -- y año. ★C1: este bloque se había perdido en 0025; restaurado en 0030.
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

  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio')::numeric), 0)
    into v_base from jsonb_array_elements(v_lines) l;
  v_base  := round(v_base, 2);
  v_iva   := round(v_base * v_iva_rate  / 100, 2);
  v_irpf  := round(v_base * v_irpf_rate / 100, 2);
  v_total := v_base + v_iva - v_irpf;

  -- ★ Identidad fiscal SIEMPRE desde el servidor (no se acepta override del cliente).
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
          '&numserie=' || v_numero ||
          '&fecha='    || to_char(p_fecha, 'DD-MM-YYYY') ||
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
      v_line->>'origen', v_line->>'destino',
      nullif(v_line->>'descripcion', ''),                   -- ★D
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
