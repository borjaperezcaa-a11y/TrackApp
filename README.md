# TrackApp

App web (PWA) de gestión y facturación para camioneros autónomos en España.
Clientes · viajes · **generación de facturas a partir de viajes** · panel de rentabilidad.

> Motor Verifactu (huella encadenada + QR) construido y testeado, **aún NO certificado**:
> no envía registros a la AEAT ni firma con certificado digital. No es facturación oficial todavía.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + Storage), región UE — el servidor es la fuente de la verdad
- Auth en servidor (`@supabase/ssr`), **solo anon key** en el cliente
- **Row-Level Security** en todas las tablas
- PDF en cliente (`pdf-lib`), QR (`qrcode`), validación (`zod`), tests (`vitest`)
- Tipografías Saira Condensed (display/números) + Archivo (cuerpo)

## Puesta en marcha

1. **Crear proyecto Supabase** (región UE). En _SQL Editor_ ejecuta **todas** las
   migraciones de `supabase/migrations/` **en orden numérico**, de `0001` hasta la
   última (actualmente `0031`). Esas migraciones son la fuente de verdad del esquema.
2. **Variables de entorno**: copia `.env.example` a `.env.local` y rellena
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Settings → API).
3. **Auth**: en Supabase → Authentication → URL Configuration, añade
   `http://localhost:3000/auth/callback` (y la URL de Vercel en producción).
4. Instalar y arrancar:
   ```bash
   npm install
   npm run dev
   ```
5. Tests: `npm test` · Typecheck: `npm run typecheck`

## Estructura

```
app/                 Rutas (App Router)
  login/ register/ auth/          Acceso (público)
  (app)/                          Área privada (protegida por middleware + layout)
components/          UI reutilizable (sistema de diseño del mockup)
lib/
  supabase/          Clientes browser/server/middleware (solo anon key)
  verifactu/         Motor de huella encadenada + QR (aislado, con tests)  [paso 4]
  pdf/               Generación del PDF A4 (formato FACT/25-04)            [paso 4]
  format.ts          Formato es-ES (euros, fechas, redondeo a céntimo)
supabase/migrations/ Esquema + RLS + función de emisión atómica
reference/           Mockup, brief y factura — material HISTÓRICO de arranque
```

## Seguridad (desde el día 1)

- RLS por `user_id = auth.uid()` en todas las tablas.
- Emisión de factura en **función Postgres `SECURITY DEFINER`** (atómica): numeración
  y cadena de huellas sin colisiones; la app nunca usa la service-role key.
- Facturas **inmutables** tras emitir (trigger en BD: solo cambia `pagada`).
- Cabeceras de seguridad + HSTS (`next.config.ts`); TLS lo aporta Vercel.
- RGPD: datos en UE; exportar/borrar cuenta (en módulos posteriores).

## Orden de construcción (MVP)

0. **Scaffold** ✅ — esquema + RLS + auth + PWA + sistema de diseño
1. Auth + "Mis datos" (perfil/emisor)
2. Clientes (CRUD)
3. Viajes (CRUD)
4. **Generar factura desde viajes** (+ motor Verifactu con tests + PDF)
5. Panel + estadísticas en portada
6. (Opcional) Gastos con foto y €/km real
```
