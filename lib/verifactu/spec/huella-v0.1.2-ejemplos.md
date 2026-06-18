# Ejemplos oficiales de huella — AEAT VERI*FACTU v0.1.2

Fuente: *"Detalle de las especificaciones técnicas para la generación de la huella
o hash de los registros de facturación"*, AEAT (Departamento de Informática
Tributaria), **versión 0.1.2 — 27/08/2024**, sección **6. Ejemplos**.

Son la **referencia oficial** que valida `lib/verifactu/golden.test.ts`. Si el
test falla, el motor no es conforme (la AEAT marcaría "Aceptado con errores").

## Reglas clave (secciones 3 y 5)
- Algoritmo: **SHA-256**. Salida: **hex en MAYÚSCULAS, 64 caracteres**.
- Concatenación `nombreCampo=valor&…` en el orden exacto del diseño de registro.
- Valores **sin espacios** al inicio/fin (trim). En numéricos, los ceros a la
  derecha no son relevantes (`123.1` ≡ `123.10`).
- Campo vacío: `nombre=` sin valor (p. ej. `Huella=` en el primer registro).
- Cadena codificada en **UTF-8** antes de aplicar SHA-256.
- ⚠️ El valor hasheado de `FechaHoraHusoGenRegistro` debe ser **idéntico** al del
  campo del XML. Los ejemplos usan hora local con huso (`+01:00`); usar `Z` (UTC)
  también es ISO-8601 válido, pero XML y huella deben coincidir byte a byte.

## Campos por tipo de registro
- **Alta** (8): IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura,
  TipoFactura, CuotaTotal, ImporteTotal, Huella (anterior), FechaHoraHusoGenRegistro.
- **Anulación** (5): IDEmisorFacturaAnulada, NumSerieFacturaAnulada,
  FechaExpedicionFacturaAnulada, Huella (anterior), FechaHoraHusoGenRegistro.

## Caso 1 — primer registro de ALTA (sin huella anterior)
Cadena:
```
IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00
```
Huella esperada:
```
3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60
```

## Caso 2 — ALTA encadenado (con huella anterior = Caso 1)
Cadena:
```
IDEmisorFactura=89890001K&NumSerieFactura=12345679/G34&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60&FechaHoraHusoGenRegistro=2024-01-01T19:20:35+01:00
```
Huella esperada:
```
F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97
```

## Caso 3 — ANULACIÓN encadenada (con huella anterior = Caso 2)
Cadena:
```
IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&FechaExpedicionFacturaAnulada=01-01-2024&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00
```
Huella esperada:
```
177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68
```
