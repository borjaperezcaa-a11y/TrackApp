import { clsx } from "@/lib/clsx";

/** Envoltorio etiqueta + control, con el estilo de formulario del mockup. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx("mb-3.5", className)}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block px-1 text-xs font-bold uppercase tracking-[0.1em] text-dim"
      >
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 px-1 text-xs text-dim">{hint}</p>}
      {error && <p className="mt-1.5 px-1 text-xs font-semibold text-red">{error}</p>}
    </div>
  );
}
