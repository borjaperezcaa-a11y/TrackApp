/**
 * Validadores fiscales españoles. Se usan para validar entradas (NIF/CIF/IBAN)
 * en perfil y clientes. Vacío = "sin dato" (no se valida; lo decide el llamante).
 */

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** DNI: 8 dígitos + letra de control. */
export function isValidDNI(value: string): boolean {
  const v = value.trim().toUpperCase();
  if (!/^\d{8}[A-Z]$/.test(v)) return false;
  const num = parseInt(v.slice(0, 8), 10);
  return DNI_LETTERS[num % 23] === v[8];
}

/** NIE: X/Y/Z + 7 dígitos + letra. */
export function isValidNIE(value: string): boolean {
  const v = value.trim().toUpperCase();
  if (!/^[XYZ]\d{7}[A-Z]$/.test(v)) return false;
  const prefix = { X: "0", Y: "1", Z: "2" }[v[0] as "X" | "Y" | "Z"];
  const num = parseInt(prefix + v.slice(1, 8), 10);
  return DNI_LETTERS[num % 23] === v[8];
}

/** CIF: letra de organización + 7 dígitos + dígito o letra de control. */
export function isValidCIF(value: string): boolean {
  const v = value.trim().toUpperCase();
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) return false;

  const digits = v.slice(1, 8);
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    let n = parseInt(digits[i], 10);
    if (i % 2 === 0) {
      // posiciones impares (1ª,3ª…): ×2 y sumar dígitos del resultado
      n *= 2;
      if (n > 9) n = Math.floor(n / 10) + (n % 10);
    }
    sum += n;
  }
  const control = (10 - (sum % 10)) % 10;
  const expectedDigit = String(control);
  const expectedLetter = "JABCDEFGHI"[control];
  const last = v[8];
  const orgLetter = v[0];

  if ("ABEH".includes(orgLetter)) return last === expectedDigit;
  if ("KPQS".includes(orgLetter)) return last === expectedLetter;
  return last === expectedDigit || last === expectedLetter; // resto: cualquiera
}

/** NIF (DNI o NIE) o CIF. */
export function isValidNIFOrCIF(value: string): boolean {
  const v = value.trim().toUpperCase();
  if (!v) return false;
  return isValidDNI(v) || isValidNIE(v) || isValidCIF(v);
}

/** IBAN: validación por mod-97 (ISO 7064). Acepta espacios. */
export function isValidIBAN(value: string): boolean {
  const v = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  // mod 97 por bloques para evitar BigInt
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    remainder = parseInt(String(remainder) + expanded.substring(i, i + 7), 10) % 97;
  }
  return remainder === 1;
}
