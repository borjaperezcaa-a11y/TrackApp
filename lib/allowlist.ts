/**
 * Lista blanca de emails autorizados a registrarse ("modo invitación").
 * Se configura con la variable de entorno ALLOWED_EMAILS (emails separados por
 * comas). Mientras esté vacía o sin definir, NO hay restricción (cómodo en
 * desarrollo). En producción, ponla con los emails permitidos y así, aunque la
 * URL sea pública, solo podrá crear cuenta quien tú autorices.
 *
 * Ej.: ALLOWED_EMAILS="cunao@example.com, yo@example.com"
 */
export function isEmailAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS?.trim();
  if (!raw) return true; // sin lista → sin restricción
  const permitidos = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return permitidos.includes(email.trim().toLowerCase());
}
