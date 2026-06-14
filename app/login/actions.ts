"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credsSchema = z.object({
  email: z.string().email("Email no válido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export type AuthState = { error?: string; message?: string };

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

const NOT_CONFIGURED =
  "La app aún no está conectada a Supabase. Rellena NEXT_PUBLIC_SUPABASE_URL y ANON_KEY en .env.local y reinicia el servidor.";

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: NOT_CONFIGURED };
  const parsed = credsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "Email o contraseña incorrectos." };
  }

  redirect("/");
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: NOT_CONFIGURED };

  const parsed = credsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });
  if (error) {
    return { error: "No se pudo crear la cuenta. ¿Ya existe?" };
  }

  return {
    message: "Cuenta creada. Revisa tu correo para confirmar el email y luego inicia sesión.",
  };
}
