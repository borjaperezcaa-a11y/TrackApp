import { createHash } from "node:crypto";

/**
 * Comprueba si una contraseña aparece en filtraciones conocidas usando la API
 * pública "Pwned Passwords" de HaveIBeenPwned con k-anonymity: solo se envían
 * los 5 primeros caracteres del hash SHA-1, nunca la contraseña ni el hash
 * completo. Sin clave de API. Equivale a la protección "de pago" de Supabase.
 *
 * Fail-open: si HIBP no responde, NO bloquea el registro (devuelve false).
 * Solo servidor (usa node:crypto).
 */
export async function isPwnedPassword(password: string): Promise<boolean> {
  try {
    const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2500), // no bloquear el registro si HIBP va lento
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.split("\n").some((line) => {
      const [hashSuffix, countStr] = line.trim().split(":");
      return hashSuffix === suffix && Number(countStr ?? 0) > 0;
    });
  } catch {
    return false; // fail-open: una caída de HIBP no debe impedir registrarse
  }
}
