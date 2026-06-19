"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isPwnedPassword } from "@/lib/validation/pwned";
import { isEmailAllowed } from "@/lib/allowlist";

const credsSchema = z.object({
  email: z.string().email("Email no válido"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(200),
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
  // Token del CAPTCHA (Turnstile) si está activo; si no, va undefined y Supabase lo ignora.
  const captchaToken = formData.get("cf-turnstile-response")?.toString() || undefined;
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: { captchaToken } });
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

  // Modo invitación: solo los emails autorizados pueden crear cuenta.
  if (!isEmailAllowed(parsed.data.email)) {
    return { error: "El registro está limitado por invitación. Pide acceso al administrador." };
  }

  // Rechaza contraseñas presentes en filtraciones conocidas (gratis, sin Pro).
  if (await isPwnedPassword(parsed.data.password)) {
    return {
      error: "Esa contraseña aparece en filtraciones conocidas. Elige una más segura.",
    };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const captchaToken = formData.get("cf-turnstile-response")?.toString() || undefined;
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${siteUrl}/auth/callback`, captchaToken },
  });
  // Mensaje neutro: no revelamos si el email ya existía (anti-enumeración).
  if (error) {
    return { error: "No se pudo completar el registro. Inténtalo de nuevo en un momento." };
  }

  return {
    message:
      "Si los datos son correctos, te hemos enviado un correo para confirmar la cuenta. Luego inicia sesión.",
  };
}
