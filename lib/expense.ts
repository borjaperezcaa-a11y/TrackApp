/** Categorías de gasto del oficio + utilidades compartidas. */

export const EXPENSE_CATEGORIES = [
  "Gasoil",
  "Peaje",
  "Taller",
  "AdBlue",
  "Dieta",
  "Parking",
  "Otro",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Gasoil: "var(--amber)",
  Dieta: "var(--purple)",
  Peaje: "var(--blue)",
  Taller: "var(--red)",
  AdBlue: "var(--green)",
  Parking: "var(--yellow)",
  Otro: "var(--dim)",
};

/** Datos que la IA extrae de un ticket (cualquiera puede venir null). */
export type ExtractedExpense = {
  total: number | null;
  base: number | null;
  iva: number | null;
  iva_rate: number | null;
  fecha: string | null; // YYYY-MM-DD
  establecimiento: string | null;
  categoria: ExpenseCategory | null;
  confianza: number; // 0..1
};
