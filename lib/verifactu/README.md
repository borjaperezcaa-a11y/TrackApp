# verifactu (motor independiente)

Motor de **huella SHA-256 encadenada** + **QR** para facturación, inspirado en
Veri\*factu (RD 1007/2023). **Sin dependencias**: solo APIs estándar de JavaScript
y Web Crypto (`crypto.subtle`), por lo que funciona en navegador, Node 18+ y edge.

> ⚠️ **No certificado.** No envía registros a la AEAT ni firma con certificado
> digital. No constituye facturación oficial Veri\*factu por sí mismo: eso
> requiere backend + certificado en una fase posterior.

## Reutilizar en otro proyecto

Copia la carpeta `verifactu/` completa (incluye sus tests). No importa nada del
resto de la app. Si quieres publicarlo como paquete, estos cuatro ficheros son
todo lo necesario: `canonical.ts`, `huella.ts`, `index.ts` y `verifactu.test.ts`.

## API

```ts
import { computeHuella, buildQr, verifyChain, type HuellaInput } from "./verifactu";

const input: HuellaInput = {
  emisorNif: "45872506H",
  numero: "FACT/25-04",
  fechaExpedicion: "2025-03-31", // YYYY-MM-DD
  cuotaTotal: 1879.5,            // IVA repercutido
  importeTotal: 10740.0,         // base + IVA − IRPF
  huellaAnterior: null,          // huella de la factura previa (null en la 1ª)
  genTs: new Date(),             // instante de generación
};

const huella = await computeHuella(input); // hex MAYÚSCULAS (64 chars)
const qr = buildQr({ ...input });          // URL de validación
```

- `verifyChain(links)` recalcula y valida una cadena completa de facturas.
- `verifyInvoice(input, storedHuella)` valida una factura suelta.

## Cadena canónica

```
IDEmisorFactura={nif}&NumSerieFactura={numero}&FechaExpedicionFactura={DD-MM-YYYY}
&TipoFactura=F1&CuotaTotal={iva}&ImporteTotal={total}&Huella={huellaAnterior}
&FechaHoraHusoGenRegistro={YYYY-MM-DDTHH:MM:SSZ}
```

→ `SHA-256` → hex en **mayúsculas**. Importes con `formatAmount` (2 decimales,
punto, sin separador de millares). Fecha en UTC truncada a segundos.

## Conformidad con el servidor

`computeHuella` produce **exactamente** la misma huella que la función Postgres
`emit_invoice_from_trips` (`supabase/migrations/0003_emit_invoice.sql`), que es
quien emite de forma atómica. `verifactu.test.ts` fija la cadena canónica y el
hash con vectores reales y comprueba determinismo, sensibilidad y encadenado.
**Si cambias el formato aquí, cámbialo también en el SQL.**
