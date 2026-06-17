# Reporte de auditoría QA — TrackApp

Auditoría realizada sobre el código a fecha de hoy (rama `main`, desplegada en Vercel).
Metodología: 4 auditorías en paralelo (cálculos fiscales · server actions/persistencia/seguridad · API/auth/middleware · UI/estado/casos límite), con trazado manual de cálculos y ejecución de los tests (`npm test` → **51/51 OK**).

> ⚠️ **No se ha aplicado ninguna corrección.** Este informe es para que decidas qué arreglar.

---

## Resumen ejecutivo

**Estado general: sólido.** No hay fallos **Críticos** ni vulnerabilidades de acceso entre usuarios. El control de acceso (auth + filtro `user_id` + RLS), la inmutabilidad y numeración de facturas, y los cálculos de dinero que llegan a la factura emitida están **bien resueltos**. Los hallazgos son de **robustez y UX**, no agujeros explotables.

Recuento por severidad:
- **Crítico:** 0
- **Alto:** 4
- **Medio:** 9
- **Bajo:** 11

Los 4 "Altos" son los que conviene atajar primero (ninguno es una brecha de seguridad; son fallos silenciosos / de robustez).

---

## Hallazgos por módulo

### A) UI y estado

**A-01 [ALTO] Doble submit en formularios con `useTransition` → registros duplicados**
- Ubicación: `ExpenseForm.tsx:327`, `IncomeForm.tsx:256`, `ExternalInvoiceForm.tsx:402`, `InvoiceDetailClient.tsx` (rectificativa/anular), `NuevaFacturaWizard.tsx:390`.
- Descripción: el botón se deshabilita con `disabled={saving}`, pero `saving` solo se activa tras el re-render. Un doble toque rápido (típico en móvil) ejecuta `save()` dos veces antes de que `disabled` aplique.
- Reproducción: en `/gastos/nuevo`, rellenar total y pulsar "Guardar" dos veces seguidas → dos subidas a Storage + dos inserciones.
- Impacto: gastos/ingresos/facturas externas duplicados; doble archivo en Storage.
- Corrección sugerida: guard síncrono al inicio de `save()` (`if (saving) return;` o un `useRef` "inFlight"). Los `<form>` con `useActionState` (TripForm, ClientForm, ProfileForm) ya están protegidos por `useFormStatus` — no tocar.

**A-02 [ALTO] Estadísticas (y panel de inicio) no distinguen "error de carga" de "sin datos"**
- Ubicación: `app/(app)/estadisticas/page.tsx:12-18`; mismo patrón en `app/(app)/page.tsx:30`.
- Descripción: se desestructura solo `{ data }` ignorando `error`. Si una consulta falla (red/RLS), se renderizan KPIs a 0 y gráficos vacíos como si no hubiera actividad.
- Reproducción: forzar fallo en cualquiera de las consultas.
- Impacto: el usuario puede creer que ha perdido su contabilidad del periodo.
- Corrección sugerida: capturar `error` y mostrar `<LoadError/>` (como ya hacen los listados de viajes/gastos/facturas).

**A-03 [ALTO] Borrador de ingreso (`income-draft`) se restaura cuando no debería**
- Ubicación: `IncomeForm.tsx:72-92`.
- Descripción: al ir a "Nuevo cliente" se guarda el borrador en `sessionStorage`; solo se borra al volver a montar IncomeForm. Si el usuario cancela con "Atrás" sin crear el cliente, el borrador persiste y reaparece en el próximo ingreso nuevo.
- Reproducción: /ingresos/nuevo → importe 500 → "Crear «X»" → Atrás del navegador → volver a /ingresos/nuevo → aparece el 500 viejo.
- Impacto: datos obsoletos/confusos; riesgo de guardar cifras de un intento descartado.
- Corrección sugerida: limpiar el borrador al cancelar/`pagehide`, o marcarlo y descartarlo si no se vuelve con `?nuevoCliente=`. (Nota: el TripForm ya migró a modal y no usa este patrón; conviene hacer lo mismo en IncomeForm.)

**A-04 [MEDIO] Popups (buscador/calendario) se cierran con cualquier scroll → frustrante en móvil**
- Ubicación: `PlaceAutocomplete.tsx:59-61`, `DateField.tsx:62-64`.
- Descripción: al abrirse el teclado virtual la página hace scroll/resize y el desplegable se cierra justo al empezar a escribir/elegir.
- Impacto: UX pobre en móvil. Corrección: en vez de cerrar, reposicionar el popup en scroll/resize.

**A-05 [MEDIO] `ExternalInvoiceForm`: cuotas IVA/IRPF editables pueden quedar incoherentes con los tipos**
- Ubicación: `ExternalInvoiceForm.tsx:134,235-238,379,382`.
- Descripción: el usuario edita "Cuota IVA"/"IRPF" a mano sin que se reconcilien con el tipo % elegido; puede guardarse un desglose incoherente (total se recalcula bien, pero el % no cuadra con la cuota).
- Impacto: factura externa archivada con desglose fiscal inconsistente (dato propio, no Verifactu).

**A-06 [MEDIO] `DateField` no refleja cambios de `defaultISO` tras montar (acoplamiento frágil)**
- Ubicación: `DateField.tsx:43`.
- Descripción: inicializa el estado una sola vez. Si se reutiliza con valores que cambian (p. ej. autorrelleno por IA), no se actualizará. Hoy no se da. Corrección: sincronizar con un efecto sobre `defaultISO` si se va a usar controlado.

**A-07 [MEDIO] `compressImage`: fuga de `ObjectURL` si la imagen es inválida**
- Ubicación: `ExpenseForm.tsx:34-67`, `ExternalInvoiceForm.tsx:41-75`.
- Descripción: en `img.onerror` se hace `reject` pero NO se revoca la `ObjectURL` creada. Fuga de blob hasta cerrar la pestaña.
- Corrección: `URL.revokeObjectURL(url)` también en el `onerror`.

**A-08 [BAJO] `revokeObjectURL` del PDF a 60s puede dejar la previsualización en blanco en móviles lentos** — `InvoiceDetailClient.tsx:161,181`.
**A-09 [BAJO] Select de cliente vacío si el cliente fue borrado (en edición de viaje)** — `TripForm.tsx:155-169`; `required` bloquea sin explicación clara.
**A-10 [BAJO] `NuevaFacturaWizard`: `useMemo` con deps incompletas (recomputa siempre)** — `NuevaFacturaWizard.tsx:139-148`; code smell, sin impacto funcional.
**A-11 [BAJO] Accesibilidad: combobox de cliente sin roles ARIA ni teclado; varios `Field` sin `htmlFor`** — `IncomeForm.tsx:160-208`.

### B) Backend, persistencia y seguridad

**B-01 [ALTO] Condición de carrera en numeración depende de que exista la fila de perfil**
- Ubicación: `emit_invoice_from_trips` (0014:58) y `emit_rectificativa`/`_dif`.
- Descripción: la serialización por usuario usa `select ... profiles ... for update`, que solo bloquea si la fila existe. En el flujo normal existe (la crea `handle_new_user`), así que está mitigado; y los `UNIQUE (user_id, serie, anio, num)` / `(user_id, chain_index)` garantizan que **nunca se dupliquen números** (fail-closed). El riesgo teórico es solo si el perfil no existiera.
- Impacto: integridad garantizada por los UNIQUE; el problema real es que el error de carrera se reporta como genérico. Corrección: usar `pg_advisory_xact_lock` (como ya hace `log_event` en 0019:78), independiente de la existencia de filas.

**B-02 [MEDIO] Violación de constraint en emisión concurrente → mensaje genérico (no se indica que reintentar resuelve)**
- Ubicación: `app/(app)/facturas/actions.ts:70-86`.
- Descripción: el error `23505` no está en la lista de errores conocidos; se devuelve "No se pudo emitir… inténtalo de nuevo" sin más. Corrección: clasificar `23505` como reintentable con mensaje claro; añadir guard anti doble-submit en el botón de emitir.

**B-03 [MEDIO] Update/Delete no verifican filas afectadas → fallo silencioso**
- Ubicación: `togglePaidAction` (`facturas/actions.ts:207-224`) y los update/delete de clientes, viajes, gastos, ingresos, externas.
- Descripción: si el `id` no existe o es de otro usuario, RLS+filtro hacen que afecte 0 filas pero `error` es `null` → se reporta éxito sin cambiar nada. No es brecha (RLS protege), pero es feedback erróneo.
- Corrección: añadir `.select()` y comprobar que se afectó ≥1 fila.

**B-04 [MEDIO] Importes de gastos/ingresos/externas no se validan de forma cruzada en servidor**
- Ubicación: `gastos/actions.ts:23-34`, `ingresos/actions.ts:23-36`, `externas/actions.ts:30-49`.
- Descripción: `base/iva/total` llegan del cliente y se guardan sin comprobar que `total = base + iva − irpf`. Solo se validan rangos. Impacto bajo (datos propios, no AEAT) pero contamina estadísticas.

**B-05 [BAJO] Inconsistencia de reglas: gastos exige `total > 0`, pero viajes e ingresos aceptan `0`** — `viajes/actions.ts:33`, `ingresos/actions.ts:15`.
**B-06 [BAJO] `p_lines` editable no se verifica contra los viajes seleccionados** — precios de porte arbitrarios; auto-facturación, rompe trazabilidad viaje→importe. Decisión de diseño a documentar.
**B-07 [BAJO] `handle_new_user` con `on conflict do nothing` puede dejar un usuario sin perfil sin diagnóstico** — fail-closed al emitir, pero sin aviso.

### C) API, autenticación y middleware

**C-01 [ALTO] Llamadas a OpenRouteService sin timeout**
- Ubicación: `lib/routing.ts:41` (geocode) y `:87` (routeKm).
- Descripción: los `fetch` a ORS no usan `AbortSignal.timeout(...)`, a diferencia de `pwned.ts:19` (que sí). Si ORS responde lento o cuelga, `/api/places` (se dispara por cada pulsación) y `/api/distance` quedan bloqueadas.
- Impacto: degradación / posible agotamiento de conexiones bajo fallo del proveedor.
- Corrección: añadir `signal: AbortSignal.timeout(2500)` (o similar) a los tres fetch.

**C-02 [BAJO] `/api/places` y `/api/distance` sin rate limit** — exigen sesión, pero ORS tiene cuota; un usuario podría agotarla. Considerar throttling/debounce server-side.
**C-03 [BAJO] Errores de proveedores externos siempre devuelven 502** (debería 503/504 en timeouts) — `expenses/scan:125`, `invoices/scan:138`, `places:27`, `distance:34`. Cosmético.
**C-04 [BAJO] `imageBase64` no valida que sea base64 ni el magic-number vs `mediaType`** — `expenses/scan:53-56`. Mitigado por límite de tamaño y enum; gastaría 1 unidad de rate-limit.
**C-05 [BAJO] `routeKm` vuelca el cuerpo de error de ORS a `console.error`** — `lib/routing.ts:100`. No filtra secretos al cliente; solo ruido en logs internos.

### D) Cálculos fiscales

**D-01 [MEDIO] `parseDecimal("1.500")` devuelve `1.5` (trampa de millares)**
- Ubicación: `lib/format.ts:86-93`.
- Descripción: sin coma, el punto se trata siempre como decimal. Un usuario que teclee `1.500` pensando "mil quinientos" obtiene 1,5.
- Reproducción: `parseDecimal("1.500") → 1.5`.
- Impacto: mitigado porque los `<input type="number">` entregan formato en-US; solo afecta a pegado/edición manual con formato español sin coma. Corrección: documentarlo en UI o detectar el patrón de millares.

**D-02 [BAJO] `round2` tiene sesgo hacia +∞ en negativos (latente)** — `format.ts:64-66`; `round2(-1.005) → -1`. No alcanzable hoy (solo se usa sobre importes positivos).
**D-03 [BAJO] `computeInvoiceTotals` divergería de Postgres con cantidad/precio de >2 decimales** — `lib/invoice.ts:31-48`. No alcanzable por UI (`step="0.01"`).
**D-04 [BAJO] `categoryBreakdown`: `pct` negativo si hubiera gastos negativos** — `stats.ts:112-125`. Inalcanzable (inputs `min="0"`). Cosmético.

---

## Lista priorizada de acción

1. **A-01** — Guard anti doble-submit en formularios con `useTransition` (gastos, ingresos, externas, rectificativa). *Evita duplicados reales.*
2. **A-02** — `<LoadError/>` en Estadísticas y panel de inicio. *Evita confundir fallo con "sin datos".*
3. **C-01** — Timeout en los `fetch` a OpenRouteService. *Evita cuelgues.*
4. **A-03** — Arreglar el borrador de IncomeForm (o migrar a modal como TripForm).
5. **B-03** — Verificar filas afectadas en update/delete (quitar fallos silenciosos).
6. **A-07** — Revocar `ObjectURL` también en `img.onerror`.
7. **B-02 / B-01** — Manejo de carrera en emisión: clasificar `23505` + `pg_advisory_xact_lock`.
8. Resto (Medios/Bajos) — según prioridad: A-05, B-04, A-04, C-02…

---

## Verificado correcto (lo que está bien)

- **Cálculos de factura:** base/IVA/IRPF/total cuadran al céntimo (trazado FACT/25-04 y casos límite); aritmética en céntimos inmune a coma flotante; total = base+iva−irpf y suma de líneas correctas.
- **Verifactu:** huella SHA-256 encadenada, canónica y QR coinciden con el SQL; negativos de rectificativa correctos; verificación cliente↔servidor consistente.
- **Periodos fiscales:** trimestres, fronteras, año bisiesto y filtrado por año correctos; sin desfase de zona horaria.
- **Validación fiscal:** NIF/CIF/NIE/IBAN correctos (algoritmos verificados).
- **Seguridad/acceso:** auth en toda action y API (401), filtro `user_id` + RLS en todas las tablas, inmutabilidad de facturas, identidad fiscal no falsificable, numeración única, una sola rectificativa por factura, registro de eventos inalterable, open-redirect cubierto, secretos server-only y fuera del repo, CSRF en signout, anti-enumeración en registro.
- **Robustez de cálculo:** divisiones por cero guardadas; `num()` blinda NaN; estados vacío/error en listados; limpieza de timers/abort/RAF; validación de fechas imposibles.

---

## Dudas / cosas que necesito de ti (verificación manual)

- **Paridad JS↔Postgres** de los cálculos se verificó por trazado manual del SQL, no ejecutando la función real contra una BD. Para certeza total convendría una prueba contra el proyecto Supabase de pruebas.
- **A-01 (doble submit)** y **A-04 (popups con scroll)** se reproducen mejor en un **móvil real**; conviene confirmarlos ahí.
- **C-01 (timeout ORS)** solo se manifiesta con el proveedor lento/caído; no reproducible en condiciones normales.
