# Capa de envío VERI*FACTU a la AEAT — diseño (NO implementada)

> Estado: **documento de diseño**. Hoy TrackApp **NO envía nada a la AEAT**.
> El generador de XML (`lib/verifactu/xml/registro.ts`) es un módulo **puro**:
> serializa el registro pero no lo transmite. No hay cliente SOAP, ni
> certificado, ni cola, ni lógica de reintentos/Incidencia. Esto es **a
> propósito** (Fase 1, paso de envío, apagado por decisión).
>
> ⚠️ **No activar el envío real ni declarar conformidad sin petición expresa.**
> Declarar conformidad sin serlo expone al **art. 201 bis LGT (150.000 €)**.

Este documento describe **cómo debería ser** la capa de remisión cuando se decida
el salto a oficial, con especial foco en el **comportamiento ante cortes de
conexión**, que es lo que pregunta la normativa.

## 1. Qué exige la AEAT (verificado en las FAQ oficiales, jun-2026)

VERI*FACTU es un modo **en línea**: el sistema debe remitir los registros *"de
forma continuada, segura, correcta, íntegra, automática, consecutiva,
**instantánea** y fehaciente"*.

Sobre **cortes de conexión** (apagón, fallo de internet, caída de la sede AEAT):
1. **NO se interrumpe la facturación**: se sigue emitiendo (con QR + huella).
2. **NO vale el volcado diferido** "al final del día" en lote. Prohibido expresamente.
3. Hay que **reintentar la remisión periódicamente** hasta que entre.
4. Los registros remitidos **tras** un problema se marcan con **"Incidencia"** en
   la cabecera del envío.
5. Durante la contingencia, **los plazos de remisión se amplían** hasta que se
   restablezca el servicio.

Para operar **sin conexión de forma permanente** (no solo cortes puntuales) la vía
legal NO es "offline sobre VeriFactu", sino el **modo NO VERI*FACTU** (custodia
local + firma XAdES + registro de eventos) — eso es otra fase aparte.

Fuentes (sede AEAT):
- FAQ "Capacidad de remisión": `.../preguntas-frecuentes/caracteristicas-requisitos-sif-capacidad-remision-etc_.html`
- FAQ "Sistemas VERI*FACTU": `.../preguntas-frecuentes/sistemas-verifactu.html`
- "Aclaraciones a dudas de los desarrolladores" (PDF): `static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf`

## 2. Diseño propuesto

### 2.1 Cola persistente de registros (lo primero, se puede hacer SIN enviar)
- Tabla nueva, p. ej. `verifactu_envios`:
  - `invoice_id` (FK), `chain_index` (orden de la cadena — CLAVE para remitir en orden),
  - `xml` (el registro serializado), `estado` (`pendiente` | `enviado` | `error`),
  - `intentos`, `ultimo_intento_at`, `incidencia` (bool), `respuesta_aeat` (csv/errores),
  - `created_at`.
- Al **emitir** una factura (`emit_invoice_from_trips` y rectificativas), insertar
  también la fila en la cola con `estado='pendiente'`, reutilizando el XML de
  `registro.ts` (que ya es conforme a los XSD y usa la huella validada).
- **Orden garantizado**: nunca remitir el `chain_index = n` antes que `n-1`. La
  cola se procesa estrictamente en orden de cadena por emisor.

### 2.2 Worker de remisión con reintentos (gated: requiere certificado)
- Proceso periódico (cron/edge function) que toma los `pendiente` en orden y los
  remite por **SOAP + mTLS** al endpoint AEAT.
- Endpoints (ver `lib/verifactu/spec/README.md` + `SistemaFacturacion.wsdl`):
  - **Preproducción** (pruebas) y **Producción** (real). Empezar SIEMPRE por preproducción.
- Reintento con backoff ante fallo de red/sede; **sin** volcado en lote: es envío
  continuo, solo que diferido por la incidencia.

### 2.3 Marca de "Incidencia"
- Si un registro se remite después de un corte (no en el flujo instantáneo
  normal), poner el indicador de **Incidencia** en la cabecera del envío, según el
  XSD `SuministroLR`/cabecera. Marcar `incidencia=true` en la fila.

### 2.4 No bloquear la facturación
- La emisión de la factura (huella, número, PDF, QR) **no depende** del resultado
  del envío. Si la cola está parada por un corte, el usuario sigue facturando; la
  cola drena cuando vuelve la conexión.

## 3. Lo que falta antes de poder activar (checklist Fase 1)
- [ ] Cola persistente + inserción en la emisión (LOCAL, sin enviar). 
- [ ] Datos del PRODUCTOR: NIF/nombre, `NºInstalación`, `IdSIF` (ya = "TA").
- [ ] Certificado de sello/representante + custodia (secreto, fuera del repo).
- [ ] Cliente SOAP + mTLS contra **preproducción** primero.
- [ ] Validación estricta del XML contra XSD (librería).
- [ ] Declaración responsable del productor (embebida + versionada).
- [ ] Activar leyenda "VERI*FACTU / verificable en sede" y bloquear la huella a
      una sola fórmula (quitar la tolerancia legado base+IVA−IRPF).

## 4. Recordatorio de límites
- Pasos 2.2 en adelante (envío real, certificado, declaración) **NO** se hacen sin
  petición expresa de Borja. La cola (2.1) y el resto de preparación **local** sí
  se pueden adelantar sin transmitir nada.
