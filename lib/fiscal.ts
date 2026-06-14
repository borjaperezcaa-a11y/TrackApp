/** Periodos fiscales (España, trimestres naturales = periodos de IVA). */

export type Period = "Y" | "1" | "2" | "3" | "4";

export const MONTH_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** Etiquetas de los 3 meses de cada trimestre. */
export const QUARTER_MONTHS: Record<"1" | "2" | "3" | "4", number[]> = {
  "1": [0, 1, 2],
  "2": [3, 4, 5],
  "3": [6, 7, 8],
  "4": [9, 10, 11],
};

/** Trimestre (1-4) de un mes 0-indexado. */
export function quarterOfMonth(month0: number): 1 | 2 | 3 | 4 {
  return (Math.floor(month0 / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Descompone una fecha "YYYY-MM-DD" sin pasar por Date (evita desfases de zona). */
export function dateParts(iso: string): { year: number; month0: number; day: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { year: y, month0: m - 1, day: d };
}

/** ¿La fecha cae en el año y periodo indicados? */
export function isInPeriod(iso: string, year: number, period: Period): boolean {
  const { year: y, month0 } = dateParts(iso);
  if (y !== year) return false;
  if (period === "Y") return true;
  return quarterOfMonth(month0) === Number(period);
}

export function periodLabel(period: Period): string {
  return period === "Y" ? "Año" : `T${period}`;
}
