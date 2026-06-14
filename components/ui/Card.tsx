import { clsx } from "@/lib/clsx";

export function Card({
  children,
  className,
  soft = false,
}: {
  children: React.ReactNode;
  className?: string;
  soft?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-[20px] border border-line p-[18px] shadow-[var(--shadow)]",
        soft ? "bg-panel2" : "bg-panel",
        className,
      )}
    >
      {children}
    </div>
  );
}
