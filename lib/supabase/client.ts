import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para el NAVEGADOR. Solo usa la anon key pública.
 * La seguridad real la impone Row-Level Security en Postgres, no este cliente.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
