import type { BadgeTone } from "@/components/ui/Badge";

/** €/km bruto (ingreso por km). El margen real requiere gastos (MVP+). */
export function eurPerKm(importe: number, km: number | null | undefined): number | null {
  if (!km || km <= 0) return null;
  return importe / km;
}

/** Etiqueta de rentabilidad bruta a partir del €/km. */
export function profitability(
  eurKm: number | null,
): { label: string; tone: BadgeTone } | null {
  if (eurKm == null) return null;
  if (eurKm >= 1.0) return { label: "Rentable", tone: "good" };
  if (eurKm >= 0.8) return { label: "Ajustado", tone: "mid" };
  return { label: "Flojo", tone: "bad" };
}
