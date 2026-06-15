# Desplegar TrackApp para una prueba privada

Guía mínima para subirla a la nube y que **solo tu invitado** (p. ej. tu cuñao)
pueda probarla. Tiempo aprox.: 20–30 min.

## 0. Antes de nada: región de Supabase (RGPD)
Manejas datos personales y fiscales de España → el proyecto de Supabase debe
estar en la **UE**.
- Supabase → **Project Settings → General → Region**. Debe ser una región UE
  (p. ej. *Frankfurt / eu-central-1*). Si está en EE. UU., **recrea** el
  proyecto en la UE antes de meter datos reales (no se puede mover después).

## 1. Aplicar las migraciones pendientes
En Supabase → **SQL Editor**, pega y ejecuta en orden las que falten:
`0019`, `0020`, `0021`, `0022` (de `supabase/migrations/`).

## 2. Cerrar el registro (modo invitación)
Dos opciones (con una basta; puedes poner las dos):
- **Por código (recomendada):** define la variable `ALLOWED_EMAILS` con los
  emails permitidos (ver paso 4). Aunque la URL sea pública, solo esos emails
  podrán crear cuenta.
- **En Supabase:** Authentication → Sign In / Providers → Email →
  desactiva *"Allow new users to sign up"*, y crea tú la cuenta en
  Authentication → Users → **Add user**.

## 3. Subir el repo a GitHub
```bash
git add -A && git commit -m "deploy"   # si tienes cambios sin commitear
# crea un repo vacío en github.com y luego:
git remote add origin https://github.com/TU_USUARIO/trackapp.git
git push -u origin main
```

## 4. Desplegar en Vercel (plan gratis)
1. vercel.com → **Add New → Project** → importa el repo de GitHub.
2. En **Environment Variables**, añade:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` (para el escaneo de tickets con IA)
   - `NEXT_PUBLIC_SITE_URL` → la URL que te dé Vercel (p. ej. `https://trackapp-xxx.vercel.app`)
   - `ALLOWED_EMAILS` → los emails que pueden registrarse, separados por comas
3. **Deploy**.

> Si cambias `NEXT_PUBLIC_SITE_URL` después de saber la URL final, vuelve a
> desplegar para que los enlaces de los emails apunten bien.

## 5. Configurar Auth en Supabase para la URL de producción
Supabase → **Authentication → URL Configuration**:
- **Site URL** = tu URL de Vercel.
- **Redirect URLs** = añade `https://TU-URL.vercel.app/auth/callback`.

## 6. Crear/invitar al usuario y probar
- Si cerraste el registro en Supabase: crea su usuario en Authentication → Users.
- Si usas `ALLOWED_EMAILS`: que se registre él mismo con su email (ya autorizado)
  y confirme el correo.
- En el móvil: abrir la URL → **"Añadir a pantalla de inicio"** (se instala como app).

## RGPD mínimo (para tener en cuenta)
- Región UE (paso 0). ✔
- Para una sola persona de confianza, el riesgo es bajo, pero si pasa de prueba
  a uso real necesitarás: **política de privacidad**, base legal del tratamiento,
  y un contrato de encargado del tratamiento con Supabase (DPA, disponible en su
  web). El email de confirmación y el aislamiento por usuario (RLS) ya están.

## Recordatorio
La app **aún no envía a la AEAT** ni firma con certificado: las facturas son
"documento de prueba". Perfecto para probar y dar feedback; todavía **no debe
sustituir la facturación oficial**.
