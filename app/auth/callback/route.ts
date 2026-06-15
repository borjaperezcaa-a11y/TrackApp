import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback de confirmación de email / OAuth. Intercambia el código por sesión.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Solo se permiten rutas internas: empieza por "/" pero no por "//" ni "/\"
  // (evita open redirect a dominios externos protocol-relative).
  const nextParam = searchParams.get("next") ?? "/";
  const next = /^\/(?![/\\])/.test(nextParam) ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
