# Diccionario de datos — TrackApp

Mapa de la base de datos (Supabase / Postgres, esquema `public`). Sirve para
**localizar cualquier dato si algo falla**. Fuente de verdad: las migraciones en
[`supabase/migrations/`](./migrations). Si cambias el esquema, añade una migración
nueva y actualiza este documento.

> Regla común a todas las tablas: cada fila cuelga de un usuario por `user_id`, y
> el **RLS** (Row-Level Security) garantiza que cada usuario solo ve lo suyo.
> Las fechas `created_at`/`updated_at` son automáticas.

## Mapa de relaciones

```
auth.users (cuentas: email + contraseña cifrada)
   │ user_id
   ├─ profiles            (1 por usuario: tus datos de emisor + numeración)
   ├─ clients ───────────┐
   │                     │ client_id
   ├─ vehiculos          │  (tu flota de camiones)
   ├─ viajes ────────────┤  (desplazamiento físico: ruta + km una vez; viaje.vehiculo_id → vehiculos)
   │     │ viaje_id       │
   ├─ trips (= PORTES) ──┤  (cada carga de un cliente dentro de un viaje; al facturar, invoice_id → invoices)
   │     │ invoice_id     │
   ├─ invoices ──────────┘  (cabecera de factura; cliente_snapshot congelado)
   │     │ invoice_id
   │     └─ invoice_lines    (los portes de cada factura)
   ├─ expenses              (gastos; opcional trip_id)
   ├─ incomes              (ingresos manuales)
   ├─ external_invoices    (facturas que recibes)
   ├─ system_events        (LOG inmutable de acciones — la "caja negra")
   └─ ai_scan_events       (control de uso del escaneo IA)
```

> **Modelo viaje ↔ portes:** un `viajes` (desplazamiento físico, con sus km) contiene
> uno o varios `trips` (PORTES), cada uno de un cliente con su ruta e importe. Los km
> viven en el viaje (se cuentan una vez); la facturación opera sobre los portes.

---

## Tablas

### `profiles` — datos del emisor (1 fila por usuario)
| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid (PK) | = id del usuario en auth.users |
| `nombre`, `nif`, `direccion`, `cp_localidad`, `iban` | text | Datos fiscales que salen en la factura |
| `iva_def` | numeric | IVA por defecto (21) |
| `irpf_def` | numeric | IRPF por defecto (1) |
| `serie` | text | Serie de numeración (def. `FACT`) |
| `contador` | int | Nº global de facturas emitidas (cadena de huellas) |
| `logo_url` | text | Ruta del logo en el bucket `logos` |
| `factura_plantilla` | text | Plantilla del PDF: `trackapp` · `elegante` (Clásica) · `moderna` (mig. 0024) |
| `num_inicial`, `num_inicial_anio`, `num_inicial_serie` | int/smallint/text | "Suelo" de numeración si ya facturabas fuera de la app |

### `clients` — clientes
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `nombre` | text (obligatorio) | |
| `nif`, `direccion`, `cp_localidad`, `condiciones_pago` | text | |
| `email` | text | Contacto para enviar la factura (envío aún no activado · mig. 0026) |

### `vehiculos` — camiones de la flota (mig. 0029)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `nombre` | text (obligatorio) | Alias: "Volvo FH", "Camión 1" |
| `matricula` | text | Opcional |
| `activo` | boolean | Para retirar un camión sin borrarlo |

### `viajes` — viajes FÍSICOS (desplazamiento real, mig. 0027)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `fecha` | date | |
| `origen`, `destino` | text | Ruta física, p. ej. "15890 Santiago de Compostela" |
| `km` | numeric | Km del viaje, se cuentan UNA vez |
| `vehiculo_id` | uuid → vehiculos | Qué camión lo hizo (opcional) |

### `trips` — PORTES (cada carga de un cliente; pertenecen a un viaje)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `viaje_id` | uuid → viajes | Viaje al que pertenece el porte (mig. 0027) |
| `client_id` | uuid → clients | Cliente del porte |
| `fecha` | date | |
| `origen`, `destino` | text | "CP Localidad"; varias paradas (grupaje) van separadas por salto de línea |
| `km` | numeric | Heredado del modelo antiguo; los km del periodo salen de `viajes` |
| `importe` | numeric (obligatorio) | Lo que se factura del porte |
| `descripcion` | text | Tipo de carga / observaciones |
| `peso`, `peso_unidad` | numeric / `t`\|`kg` | Peso de la carga (def. kg) |
| `estado` | text | `pendiente` o `facturado` |
| `invoice_id` | uuid → invoices | La factura donde se incluyó (si está facturado) |

### `invoices` — facturas emitidas (INMUTABLES; solo `pagada` cambia)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `numero` | text | "FACT/25-04" |
| `serie`, `anio`, `num` | text/smallint/int | Numeración correlativa por (serie, año) |
| `chain_index` | int | Posición en la cadena de huellas del usuario |
| `client_id` | uuid → clients | |
| `fecha`, `forma_pago` | date/text | |
| `base`, `iva_rate`, `iva`, `irpf_rate`, `irpf`, `total` | numeric | `total = base + iva − irpf` |
| `prev_hash`, `huella` | text | Huella SHA-256 encadenada (Verifactu) |
| `gen_ts` | timestamptz | Instante que entra en la huella |
| `qr` | text | Payload de verificación (aún NO oficial) |
| `emisor_snapshot`, `cliente_snapshot` | jsonb | Datos congelados al emitir |
| `pagada` | boolean | Lo único editable |
| `tipo` | text | `F1` normal · `R1` rectificativa |
| `rectifica_id` | uuid → invoices | A qué factura rectifica (si `R1`) |
| `motivo` | text | Motivo de la rectificativa |

### `invoice_lines` — portes de cada factura
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `invoice_id` | uuid → invoices | |
| `trip_id` | uuid | Viaje de origen (sin FK dura) |
| `fecha`, `origen`, `destino`, `descripcion` | | |
| `cantidad`, `precio`, `importe` | numeric | |
| `orden` | int | Orden de aparición |

### `expenses` — gastos
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `categoria` | text | Gasoil, Peaje, Taller, AdBlue, Dieta, Parking, Otro |
| `base`, `iva`, `total` | numeric | |
| `estacion`, `fecha` | text/date | |
| `trip_id` | uuid → trips | Opcional |
| `foto_url` | text | Ruta en bucket `recibos`. ⚠️ En el formulario se llama `foto_path` (la server action lo traduce a `foto_url`) |

### `external_invoices` — facturas que recibes
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `fuente` | text | `cooperativa` o `otra` |
| `numero`, `serie` | text | Tal cual lo asigna quien la emite |
| `fecha`, `cliente`, `cliente_nif`, `concepto` | | |
| `base`, `iva_rate`, `iva`, `irpf_rate`, `irpf`, `total` | numeric | `total = base + iva − irpf` |
| `cobrada` | boolean | |
| `archivo_url` | text | Ruta en bucket `facturas`. ⚠️ En el formulario `archivo_path` |
| `qr_raw`, `notas` | text | |

### `incomes` — ingresos manuales (NO son facturas, NO van a la AEAT)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `concepto`, `cliente` | text | |
| `fecha` | date | |
| `base`, `iva_rate`, `iva`, `total` | numeric | |
| `cobrada` | boolean | |
| `notas` | text | |

### `system_events` — registro de eventos (LOG inmutable, la "caja negra")
Solo se escribe vía función interna; no se puede editar ni borrar. **Aquí miras
qué pasó y cuándo si algo falla.**
| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigint (PK) | |
| `tipo` | text | p. ej. `factura_emitida`, `numeracion_configurada` |
| `detalle` | jsonb | Datos del evento |
| `entidad`, `entidad_id` | text | A qué afecta (`factura`, `perfil`…) |
| `chain_index`, `prev_hash`, `huella` | int/text | Cadena encadenada (integridad) |
| `created_at` | timestamptz | |

### `ai_scan_events` — control de uso del escaneo con IA
Una fila por escaneo, para limitar el coste (rate limit). Sin acceso directo del
cliente.

---

## Almacenamiento de archivos (Storage)
| Bucket | Contenido | Acceso |
|---|---|---|
| `logos` | Logo del emisor | Público |
| `recibos` | Fotos de tickets de gasto | Privado (`{user_id}/...`) |
| `facturas` | Archivos de facturas externas (PDF/imagen) | Privado (`{user_id}/...`) |

---

## Cómo localizar cosas si algo falla
1. **Supabase → Table Editor**: navega cada tabla y filtra por columna (fecha, cliente…).
2. **Supabase → SQL Editor**: consultas rápidas. Ej.:
   ```sql
   select numero, fecha, total, pagada from invoices order by emitida_at desc limit 20;
   ```
3. **`system_events`**: la caja negra — qué acciones ocurrieron y cuándo.
4. **Supabase → Logs**: errores de Postgres / API en tiempo real.
5. **Mapa siempre actualizado** (lista de tablas y columnas reales):
   ```sql
   select table_name, column_name, data_type
   from information_schema.columns
   where table_schema = 'public'
   order by table_name, ordinal_position;
   ```
