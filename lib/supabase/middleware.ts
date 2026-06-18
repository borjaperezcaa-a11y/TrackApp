import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Rutas públicas (sin sesión). Todo lo demás exige usuario autenticado. */
const PUBLIC_PATHS = ["/login", "/register", "/auth", "/error"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * CSP con nonce por petición. El nonce va en el header de la respuesta y también
 * en los headers de la PETICIÓN (Next lo lee de ahí para firmar sus propios scripts
 * de arranque). `'strict-dynamic'` permite que esos scripts nonce-ados carguen los
 * chunks de Next. Sin `'unsafe-inline'` en script-src (se recupera defensa XSS).
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://*.supabase.co",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join("; ");
}

/**
 * Refresca la sesión en cada request y protege las rutas privadas.
 * La fuente de la verdad de autorización sigue siendo RLS en el servidor;
 * esto es la primera barrera de UX/navegación.
 */
export async function updateSession(request: NextRequest) {
  // CSP con nonce solo en PRODUCCIÓN (en dev rompe el HMR/eval de Next).
  const applyCsp = process.env.NODE_ENV === "production";
  const nonce = applyCsp ? btoa(crypto.randomUUID()) : "";
  const csp = applyCsp ? buildCsp(nonce) : "";

  // Headers de la petición (con nonce + CSP) que se reenvían al render: rebuild
  // desde request.headers cada vez para no perder cookies actualizadas por Supabase.
  const reqHeaders = () => {
    const h = new Headers(request.headers);
    if (applyCsp) {
      h.set("x-nonce", nonce);
      h.set("content-security-policy", csp);
    }
    return h;
  };

  let response = NextResponse.next({ request: { headers: reqHeaders() } });
  if (applyCsp) response.headers.set("content-security-policy", csp);

  // Sin Supabase configurado: en DESARROLLO permite previsualizar la UI pública
  // sin backend; en PRODUCCIÓN falla cerrado (no debe desplegarse sin claves).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Supabase no configurado: faltan NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
    }
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: reqHeaders() } });
          if (applyCsp) response.headers.set("content-security-policy", csp);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
