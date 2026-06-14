# BRIEF DE CONSTRUCCIÓN — TrackApp (Android + iOS)

> Documento para entregar a **Claude Code**. Es la "fuente de la verdad" del producto.
> Hay un prototipo web funcional en `/reference/` (HTML) que define la UX, el diseño y los flujos. Úsalo como referencia visual; este documento manda en caso de duda.

---

## 0. Rol y objetivo

Actúa como **desarrollador móvil senior** y **ingeniero de seguridad**. Construye **TrackApp**, una app de gestión para **camioneros autónomos y pequeñas flotas en España**: facturación, gastos, rentabilidad por viaje y estadísticas, usable desde la cabina.

- **Plataformas:** Android e iOS desde un **único código**.
- **Prioridad nº1:** sencillez de uso (usuario cansado, una mano, a veces con guantes, de noche, con **cobertura irregular**).
- **Prioridad nº2 (innegociable):** **seguridad**. Contiene datos fiscales y personales sensibles. Ver sección 7.

---

## 1. Stack recomendado

- **Framework:** **Flutter (Dart)** — un código para iOS/Android, UI personalizada de alta fidelidad, buen offline y buenas primitivas de seguridad. (Alternativas válidas si se prefiere: React Native/Expo, o Capacitor reutilizando el prototipo web — pero Flutter da mejor control de UI y seguridad nativa.)
- **Estado:** Riverpod.
- **Rutas/navegación:** go_router.
- **Datos:** el **servidor (Supabase) es la fuente de la verdad**. En el dispositivo solo una **caché cifrada y efímera** (Drift + SQLCipher) que se borra al cerrar sesión / bloquear. **Sin base de datos local permanente.**
- **Backend (núcleo, requerido desde el día 1):** Supabase (SDK Flutter) con **Row-Level Security** y región UE; sincronización en tiempo real. Alternativa: Firebase.
- **Almacenamiento seguro de claves/PIN/tokens:** `flutter_secure_storage` (Android Keystore / iOS Keychain).
- **Biometría/PIN:** `local_auth`.
- **Gráficas:** `fl_chart` o `CustomPainter` propio (para clavar el look del prototipo).
- **PDF:** `pdf` + `printing` (compartir/guardar nativo).
- **QR:** `qr_flutter`.
- **OCR de tickets (on-device, offline):** `google_mlkit_text_recognition`.
- **HTTP (cuando haya backend):** `dio` con **certificate pinning**.
- **Tipografías:** **Saira Condensed** (display/números) + **Archivo** (cuerpo/UI), empaquetadas como assets.

---

## 2. Contexto de uso (esto guía TODO el diseño)

El usuario es un camionero reventado tras horas al volante: usa el móvil con **una mano**, puede llevar **guantes**, suele ser de **noche**, y a menudo **sin cobertura**. Por tanto:

- **Online y siempre sincronizado:** la app **requiere conexión**; el servidor es la fuente de la verdad y todo se sincroniza en tiempo real. (Ver sección 3 para manejar la pérdida puntual de cobertura sin perder datos ni dejar nada sensible de más en el móvil.)
- **Objetivos táctiles grandes**, zona del pulgar, alto contraste, mínima escritura (voz como entrada de primera clase).
- **Captura en ≤2 toques** desde cualquier pantalla.

---

## 3. Arquitectura

- **Online (servidor = fuente de la verdad):** la app **requiere conexión**. Lecturas/escrituras van contra el backend; en el dispositivo solo una **caché cifrada y efímera** para pintar la UI, que se **borra al cerrar sesión o bloquear**. No se persisten datos sensibles en local.
- **Sincronización en tiempo real** (Supabase Realtime / suscripciones) para que siempre esté al día.
- **Resiliencia ante cortes de cobertura — elegir una opción:**
  - **(A, recomendada) Online con buffer mínimo:** si se va la señal a media captura (un ticket, un borrador de factura), se guarda en un **buffer cifrado y efímero** que **debe** subir al servidor en cuanto vuelva la conexión; nada se considera "guardado" hasta que el servidor lo confirma. Evita perder un ticket en un túnel **sin** dejar datos permanentes en el móvil.
  - **(B) Estrictamente online:** sin conexión no se puede hacer nada. Más simple, pero inutiliza la app en zonas sin cobertura (frecuentes en carretera).
- **Modular por dominio:** auth, facturación, gastos, viajes, estadísticas, clientes, ajustes. **Capas:** UI (Flutter/Riverpod) → dominio (casos de uso) → datos (API + caché). Nada de lógica de negocio en la UI.
- **El motor Verifactu** (hash encadenado, registros, QR) se ejecuta y valida en el **servidor** (el servidor asigna el orden de la cadena y evita conflictos), en un **módulo aislado y 100% cubierto por tests**.

---

## 4. Funcionalidades (módulos)

> Marcadas con **(PRO)** las de pago.

**Registro y acceso**
- Registro obligatorio para usar la app. Email + contraseña, y "Continuar con Apple / Google".
- **Bloqueo con PIN + biometría** al abrir (ver seguridad).

**Inicio (home-hub)** — pantalla principal que lo concentra todo:
- Medidor de **beneficio neto del mes** (aguja animada + número que cuenta hacia arriba).
- Pills de Ingresos / Gastos del mes.
- **Mini-gráfica** ingresos vs gastos que abre Estadísticas.
- **Rejilla de accesos** (casillas con un dato en vivo): Estadísticas, Viajes, Facturas, Gastos, Clientes, Ajustes.
- **Botón "＋" flotante persistente** (zona del pulgar) que se expande en: Nueva factura · Escanear gasto · Dictar gasto.
- **Sin barra de pestañas inferior.**

**Facturas**
- Crear: cliente (habitual o nuevo), concepto (con **dictado por voz**), base imponible, IVA (21/10/4/0), retención IRPF, cálculo automático de IVA/IRPF/total.
- Numeración automática por serie (ej. `F-2026/001`).
- **Verifactu:** genera **registro de alta** + **huella SHA-256 encadenada** con la factura anterior + **QR** de verificación.
- Listado, detalle (con QR y cadena de hash), marcar cobrada/pendiente.
- **Exportar a PDF A4** con logo y datos, compartir/guardar nativo.

**Gastos**
- Foto del ticket → **OCR on-device** que rellena importe, base, IVA, fecha, establecimiento.
- Categorías del oficio: Gasoil, Peaje, Taller, AdBlue, Dieta, Parking, Otro.
- Asignar a viaje. Listado y borrado.

**Viajes / rentabilidad**
- Crear viaje (origen, destino, km, carga). Une sus facturas y gastos.
- Calcula **beneficio, €/km y % de rentabilidad**, con etiqueta (Rentable/Ajustado/Flojo).

**Estadísticas (PRO)**
- Selector de **año** y **periodo fiscal** (Año / T1 / T2 / T3 / T4).
- KPIs: ingresos, gastos, beneficio, margen %, €/km, km, IVA, nº facturas.
- Gráficas: barras ingresos vs gastos (por trimestre o mes), **donut de gastos por categoría** con leyenda, **ranking de mejores rutas** y **mejores clientes**.

**Comparativa con el sector (PRO)**
- Compara tus métricas (€/km, gasoil/km, margen, % gasoil) con la media. Agregada y anónima (ver privacidad).

**Clientes**
- Alta, edición (nombre, NIF, condiciones de pago) y borrado.

**Ajustes**
- Perfil fiscal (nombre, NIF, IVA/IRPF por defecto), **logo**, domicilio, IBAN.
- **Exportar para la gestoría** (CSV + PDF), copia de seguridad.
- Tema día/noche, **modo guantes** (objetivos y tipografía más grandes), bloqueo y sesión.

---

## 5. Diseño (sistema visual)

**Dirección estética:** industrial / "cuadro de mandos de cabina" — fondo oscuro profundo con resplandor ámbar, paneles con profundidad, tipografía técnica. Modo noche por defecto. Evitar look genérico.

**Tokens de color**
- *Noche:* fondo `#0c0e12`, panel `#15191f`, panel2 `#1c2129`, línea `rgba(255,255,255,.08)`, texto `#f4f1e9`, atenuado `#959db0`.
- *Día:* fondo `#e9e6dd`, panel `#ffffff`, texto `#191b20`, atenuado `#646c79`.
- *Acentos:* ámbar `#ffb23e` (día `#c97a00`), verde `#3ad17e` (día `#1d9b58`), rojo `#ff6a5a` (día `#cf4330`), azul `#4aa3ff`, morado `#b98cff`, amarillo `#ffd34a`.
- **Semántica fija y consistente:** verde = ingresos/bien, ámbar = gastos/aviso, rojo = pérdida/vencido. **Nunca solo color** (siempre icono o texto al lado).

**Tipografía:** Saira Condensed (títulos, importes, números — `tabular-nums`) + Archivo (cuerpo/UI). Radios ~18–20 px. Iconos: motivo de **medidor/aguja** como identidad.

**Navegación y movimiento (rápido ≤300 ms y con sentido):**
- Pantallas que **entran deslizando desde la derecha**; al volver, salen; la de atrás queda detrás, atenuada (parallax).
- **Gesto de volver deslizando desde el borde izquierdo** + atrás predictivo en Android.
- Carga con **stagger** (tarjetas que suben escalonadas). Aguja del medidor que se anima y número que cuenta. Donut y barras que crecen.
- **FAB "＋"** que se abre con un *spring* (el + rota a ×).
- Éxito al emitir/escanear: **check que se dibuja** + **háptica**.
- **Respetar "reducir movimiento"** del sistema (sustituir por fundidos) y dar **feedback háptico** en acciones clave.

**Accesibilidad:** contraste **WCAG AA**, soporte de **tipo dinámico** (que escale la fuente del sistema), etiquetas para **VoiceOver/TalkBack**, objetivos **≥48 dp**.

---

## 6. Modelo de datos (local cifrado)

- **Profile:** name, nif, address, iban, ivaDefault, irpfDefault, series, invoiceCounter, lastHashPorSerie{}, logo (imagen).
- **Client:** id, name, nif, terms.
- **Trip:** id, origin, dest, km, cargo, date.
- **Invoice:** id, number, series, clientId, clientName (instantánea), clientNif, concept, base, ivaRate, iva, irpfRate, irpf, total, date, tripId, prevHash, huella, qr, paid.
- **Expense:** id, category, base, ivaRate, iva, total, station, date, tripId, photo.

---

## 7. SEGURIDAD (CRÍTICO — datos sensibles)

> Trátalo como una app que custodia datos fiscales y personales. Implementa y documenta cada control.

**Datos en el dispositivo (mínimos)**
- **Sin base de datos local permanente.** Solo una **caché cifrada y efímera** (SQLCipher) para la UI; clave en **Android Keystore / iOS Keychain** vía `flutter_secure_storage`. La caché se **borra al cerrar sesión, al bloquear y tras inactividad**, y puede borrarse en **remoto**.
- **Bloqueo de la app:** PIN propio + **biometría** (huella/Face ID) con `local_auth`. Bloqueo al abrir y tras inactividad. Límite de intentos.
- **Nada de datos sensibles en logs**, ni en capturas (`FLAG_SECURE` en Android, ocultar contenido en el multitarea de iOS).
- Como la fuente de la verdad es el servidor, **un móvil perdido o robado tiene poco que extraer**, y la sesión se puede **revocar y la caché borrar en remoto**.

**Autenticación / autorización (servidor, desde el día 1)**
- **Auth en servidor** (Supabase/Firebase Auth), verificación de email, **límite de intentos** (anti fuerza bruta/credential stuffing), 2FA opcional.
- Contraseñas: **nunca** verificadas en cliente; hashing lento (bcrypt/Argon2) con sal por usuario en el servidor.
- **Autorización por usuario:** Row-Level Security / reglas — cada usuario **solo** accede a SUS datos. (El fallo nº1 en la nube.)
- **Control de sesión centralizado:** expiración/cierre de sesión, **revocar acceso y borrar la caché en remoto** (dispositivo perdido/robado) y **registro de accesos (auditoría)**.
- **Secretos:** en el cliente solo la clave pública (anon). Las claves privadas/servicio, nunca en la app.

**Red**
- **TLS en todo**, HSTS, y **certificate pinning** en el cliente. Prohibir tráfico en claro (`cleartextTrafficPermitted=false` / ATS estricto en iOS).

**Verifactu / certificado digital (lo más sensible)**
- El **certificado digital** que firma en nombre del autónomo va **cifrado en servidor** (gestor de secretos/KMS), **nunca en el dispositivo**, con accesos auditados. Si se filtra, alguien puede facturar en su nombre.

**Hardening de la app**
- **Ofuscación + minificación** (R8/ProGuard en Android; ofuscación de Dart `--obfuscate`).
- Detección básica de **root/jailbreak** y de **debugger/emulador**; degradar funciones sensibles si se detecta entorno comprometido.
- **Validación de entrada y codificación de salida** en todo lo que venga del usuario o del servidor (prevenir inyección/XSS si se usa cualquier WebView).
- **Dependencias:** mínimas, auditadas y fijadas; revisar CVEs. Sin scripts de terceros sin verificar.

**Privacidad / RGPD**
- Política de privacidad y **consentimiento** para todo lo que exceda el servicio (ofertas, comparativas).
- Servidores en la **UE**. Permitir **exportar y borrar** los datos. Plan de respuesta ante brechas. Contrato (DPA) con proveedores.
- Comparativas del sector: **agregación y anonimización reales** (no reidentificables).

**Copias de seguridad**
- Cifradas. El backup en JSON que pueda exportar el usuario debe avisar de que contiene datos sensibles.

---

## 8. Cumplimiento legal (España)

- **Verifactu (RD 1007/2023 + Orden HAC/1177/2024):** registro de alta + **huella SHA-256 encadenada** + **QR** + exportación estandarizada. Obligatorio para autónomos **desde el 1 de julio de 2027**, pero **el software ya debe cumplir** hoy. Cumplimiento por **declaración responsable** del desarrollador (no hay homologación por software). Multas de hasta 50.000 €/año por software no conforme.
  - **Modo Veri*factu** (envío de registros a la AEAT en tiempo real) como predeterminado — requiere backend + certificado (fase 2). Construir el motor de huella/encadenado/QR desde el inicio y validarlo contra el **entorno de pruebas de la AEAT**.
- **eCMR / documento de transporte electrónico**: a tener en cuenta para fases posteriores.
- Cálculo de **IVA (21/10/4/0)**, **retención IRPF** y **dietas** (límites exentos vigentes).
- **Nota:** la app no debe presentarse como "facturación oficial Verifactu" hasta que el envío a la AEAT y la firma con certificado estén implementados y validados.

---

## 9. Fases de entrega

1. **Núcleo online:** backend (Supabase) + **auth en servidor** + **RLS** + sincronización en tiempo real; registro/login + bloqueo PIN/biometría; caché cifrada efímera. App conectada de punta a punta.
2. **Módulos de negocio:** facturas (motor Verifactu server-side: huella + QR), gastos (OCR), viajes/€-km, dashboard home-hub, estadísticas, clientes, PDF y export. Diseño y efectos completos.
3. **Verifactu oficial + pagos:** envío de registros a la AEAT con certificado (server-side, KMS), suscripciones (Stripe).
4. **PRO y extras:** comparativa del sector, multiflota/roles, integraciones (banco, tarjeta de gasoil), eCMR.

---

## 10. Criterios de aceptación (definición de "hecho")

- **Requiere conexión**; el servidor es la fuente de la verdad y todo queda sincronizado en tiempo real. En el dispositivo **no quedan datos sensibles persistentes**; la sesión es revocable y la caché borrable en remoto.
- La app **no es accesible** sin PIN/biometría; los datos no se leen aunque se inspeccione el almacenamiento.
- La cadena de huellas Verifactu pasa **tests** contra vectores conocidos.
- Diseño y navegación fieles al prototipo (`/reference/`), con los efectos y la accesibilidad descritos.
- Sin secretos en el binario; build con ofuscación; tráfico solo TLS con pinning.
- Compila y corre en Android e iOS.

---

## 11. Cómo usar este brief con Claude Code

1. Crea un repo vacío. Guarda este archivo como `BRIEF.md` en la raíz.
2. Copia el prototipo web (los HTML que ya tienes) en una carpeta `reference/`.
3. Dile a Claude Code:
   > "Lee `BRIEF.md` y la carpeta `reference/`. Propón la estructura del proyecto Flutter y el plan por fases. Empieza por la **Fase 1 (MVP)**: primero la arquitectura y el sistema de diseño (tokens, tipografías, componentes base), luego módulo a módulo. Implementa la seguridad de la sección 7 desde el principio. Para cada módulo, escribe tests, sobre todo del motor Verifactu."
4. Itera módulo a módulo, revisando seguridad en cada uno.
