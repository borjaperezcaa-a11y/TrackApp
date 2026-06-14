# Prompt de arranque para Claude Code — TrackApp (MVP web)

> Mete en el repo, dentro de `/reference`, estos 3 ficheros antes de pegar el prompt:
> - `trackapp-mockup.html` (diseño, estética y navegación)
> - `BRIEF-TrackApp-ClaudeCode.md` (especificación completa + seguridad)
> - `Factura_FACT-25-04.pdf` (formato exacto de factura)
>
> Luego abre Claude Code en el repo y pega lo de abajo.

---

Actúa como desarrollador full-stack senior y como ingeniero de seguridad. Vamos a construir el MVP de "TrackApp", una app de gestión para camioneros autónomos en España: gestionar clientes y viajes, y GENERAR FACTURAS A PARTIR DE LOS VIAJES, con un panel de rentabilidad.

Primero LEE estos ficheros del repo y respétalos:
- /reference/trackapp-mockup.html  → sistema de diseño, estética y navegación. La app debe verse y moverse así (clava tokens, tipografías y transiciones).
- /reference/BRIEF-TrackApp-ClaudeCode.md → especificación completa de producto y, sobre todo, de SEGURIDAD.
- /reference/Factura_FACT-25-04.pdf → formato EXACTO de factura a reproducir (tabla de portes).

PLATAFORMA Y STACK
- App WEB responsive, mobile-first, instalable como PWA. Empezamos por web; nativo será una fase posterior.
- Next.js (App Router) + TypeScript + Tailwind CSS. Despliegue en Vercel.
- Backend Supabase (Postgres + Auth + Storage), región UE. Online: el servidor es la fuente de la verdad.
- Tipografías Saira Condensed (display/números) + Archivo (cuerpo). Gráficas con SVG propio o Recharts. PDF de factura en cliente (pdf-lib o jsPDF).

ARQUITECTURA Y SEGURIDAD (desde el día 1)
- Autenticación en servidor (Supabase Auth: email + OAuth). Nada de validar contraseñas en cliente.
- Row-Level Security en TODAS las tablas: cada usuario solo accede a SUS datos. Esto es innegociable.
- En el cliente solo la anon key; ningún secreto. TLS en todo. Validar y escapar todas las entradas.
- RGPD: datos en UE, permitir exportar y borrar la cuenta.

MODELO DE DATOS (con RLS por user_id)
- profiles (emisor): nombre, nif, direccion, iban, iva_def, irpf_def, serie, contador.
- clients: nombre, nif, direccion, cp_localidad, condiciones_pago.
- trips (viajes): fecha, client_id, origen, destino, km, importe, estado (pendiente|facturado), invoice_id.
- invoices: numero, serie, client_id, fecha, base, iva_rate, iva, irpf_rate, irpf, total, prev_hash, huella, qr, pagada.
- invoice_lines: invoice_id, trip_id, fecha, origen, destino, cantidad, precio, importe.
- expenses (opcional MVP+): categoria, base, iva, total, estacion, fecha, trip_id, foto_url.

ALCANCE DEL MVP (construye EN ESTE ORDEN, módulo a módulo)
0. Scaffold: Next.js + Tailwind + Supabase + Auth + esquema con RLS + manifest PWA. Propón estructura de carpetas y el SQL del esquema antes de codificar.
1. Auth + "Mis datos" (perfil/emisor: nombre, NIF, dirección, IBAN, IVA/IRPF por defecto, serie + próximo nº).
2. Clientes: alta/edición/baja.
3. Viajes: alta/edición/baja (fecha, cliente, origen, destino, km, importe, estado).
4. GENERAR FACTURA DESDE VIAJES (núcleo del producto):
   - Eliges cliente → carga sus viajes PENDIENTES (multiselección, todos marcados por defecto).
   - La factura se compone como TABLA DE PORTES igual que la de /reference (fecha, origen, destino, cantidad, precio, importe).
   - Base = suma de los viajes seleccionados; IVA (21/10/4/0) e IRPF editables; el IRPF por defecto es 1% (transporte en módulos) pero configurable.
   - El EMISOR se rellena solo desde el perfil; el cliente, desde su ficha. TODO editable para corregir errores antes de emitir.
   - Al emitir: numeración automática (serie + contador), marca los viajes como facturados, genera huella SHA-256 ENCADENADA con la factura anterior + QR (motor Verifactu aislado y CON TESTS), y PDF A4 descargable con el logo del perfil.
5. Panel (home), con las estadísticas EN PORTADA como en el mockup: beneficio neto del mes (medidor), ingresos vs gastos, accesos a secciones, y estadísticas (ingresos/gastos/beneficio/margen/€-km por trimestre fiscal, donut de gastos por categoría, rankings de rutas y clientes).
6. (Opcional MVP+) Gastos con foto y categorías para calcular el €/km real.

LÍMITES LEGALES (importante)
- El motor Verifactu (huella encadenada + QR) se construye y testea, pero NO está certificado: no envía registros a la AEAT ni firma con certificado digital todavía. Muestra un aviso de que aún no es facturación oficial. Eso es de una fase posterior con backend + certificado.

MÉTODO DE TRABAJO
- Empieza proponiendo estructura del proyecto + esquema de BD + tokens de diseño, y espera mi OK.
- Luego construye módulo a módulo. Escribe tests, especialmente del motor Verifactu (un fallo ahí es una multa).
- Pregúntame antes de cualquier decisión ambigua o irreversible. Commits pequeños.

CRITERIOS DE ACEPTACIÓN
- Funciona en el navegador del móvil y se instala como PWA.
- Cada usuario solo ve sus datos (RLS verificada).
- La factura generada desde viajes reproduce el formato de /reference, con emisor automático y todo editable.
- El panel muestra rentabilidad y estadísticas en portada, con la estética del mockup.

Confírmame el plan y empieza por el paso 0.
