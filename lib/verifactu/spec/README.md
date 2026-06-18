# Especificaciones oficiales AEAT VERI*FACTU (referencia)

Ficheros **oficiales** descargados de la AEAT, usados como **referencia** para generar
y validar el XML del registro de facturación en local. ⚠️ La app **NO envía nada** a la
AEAT: estos ficheros no se invocan en tiempo de ejecución, solo guían la implementación.

Fuente (WSDL y XSD): `https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/`

## Ficheros
- **SuministroLR.xsd** — esquema de envío de registros (alta/anulación). El **principal** para generar nuestro XML. Importa `SuministroInformacion.xsd`.
- **SuministroInformacion.xsd** — tipos comunes y listas (L1–L13: impuestos, claves de régimen, calificación, exención…). Lo importan todos. Depende de `xmldsig-core-schema.xsd` solo para la firma.
- **RespuestaSuministro.xsd** — estructura de la respuesta de la AEAT al envío (CSV, estado, errores). Para cuando se implemente el envío.
- **ConsultaLR.xsd** / **RespuestaConsultaLR.xsd** — consulta de registros ya remitidos. No necesarios para emitir.
- **SistemaFacturacion.wsdl** — definición del servicio web SOAP. Solo para el **futuro envío** (hoy apagado).
- **xmldsig-core-schema.xsd** — esquema de firma XML (W3C). Solo aplica a **NO-VERI\*FACTU** (XAdES); en VERI\*FACTU no se firma.
- **huella-v0.1.2-ejemplos.md** — ejemplos oficiales de huella (validados en `golden.test.ts`).

## Endpoints del WSDL (NO usar todavía — no se envía nada)
- Producción: `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` (y `www10` para certificado de sello).
- Preproducción/pruebas: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` (y `prewww10`).

## Siguiente paso (cuando se retome la Fase 1, en local y sin enviar)
Generar el XML de `RegistroAlta`/`RegistroAnulacion` conforme a `SuministroLR.xsd`, rellenar el bloque `SistemaInformatico` (IdSIF de 2 caracteres, NºInstalación único, versión) y validar el XML contra estos XSD. El `ImporteTotal` debe ser **base + IVA** (sin restar IRPF) — ver [[verifactu-no-certificado]].
