/**
 * verifactu/huella — cálculo de la huella SHA-256 y verificación de la cadena.
 *
 * Usa Web Crypto (`crypto.subtle`), disponible en navegador, Node 18+ y edge.
 * Sin dependencias externas.
 */

import { buildCanonical, type HuellaInput } from "./canonical";

/** SHA-256 de la cadena canónica, en hex MAYÚSCULAS (como `upper(encode(...,'hex'))`). */
export async function computeHuella(input: HuellaInput): Promise<string> {
  const bytes = new TextEncoder().encode(buildCanonical(input)); // UTF-8
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Un eslabón de la cadena: los datos de la factura + la huella almacenada. */
export type ChainLink = Omit<HuellaInput, "huellaAnterior"> & { huella: string };

export type ChainResult = {
  ok: boolean;
  /** Índice (0-based) del primer eslabón que no cuadra, o null si todo correcto. */
  brokenAt: number | null;
};

/**
 * Verifica una cadena de facturas en orden de emisión. Para cada eslabón
 * recalcula su huella usando la huella del eslabón anterior y la compara con la
 * almacenada: detecta tanto manipulación de datos como ruptura del encadenado.
 */
export async function verifyChain(links: ChainLink[]): Promise<ChainResult> {
  let prev: string | null = null;
  for (let i = 0; i < links.length; i++) {
    const { huella, ...rest } = links[i];
    const expected = await computeHuella({ ...rest, huellaAnterior: prev });
    if (expected !== huella) return { ok: false, brokenAt: i };
    prev = huella;
  }
  return { ok: true, brokenAt: null };
}

/**
 * Verifica una sola factura: recalcula su huella a partir de sus datos y de la
 * huella anterior que tiene almacenada, y la compara con la huella almacenada.
 */
export async function verifyInvoice(
  input: HuellaInput,
  storedHuella: string,
): Promise<boolean> {
  const expected = await computeHuella(input);
  return expected === storedHuella;
}
