import { clsx } from "@/lib/clsx";

export type BadgeTone = "good" | "mid" | "bad";

const TONES: Record<BadgeTone, string> = {
  good: "text-green bg-green-soft",
  mid: "text-amber bg-amber-soft",
  bad: "text-red bg-red-soft",
};

/** Etiqueta de estado (estilo .badge del mockup). Nunca solo color: lleva texto. */
export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-block rounded-[7px] px-2 py-[3px] text-[10px] font-extrabold tracking-[0.07em]",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
