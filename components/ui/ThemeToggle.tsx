"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/** Cambia entre tema noche/día (útil para conducir de día) y lo recuerda. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"night" | "day">("night");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as "night" | "day") || "night";
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "night" ? "day" : "night";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* almacenamiento no disponible */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "night" ? "Cambiar a modo día" : "Cambiar a modo noche"}
      className="ml-auto grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] border border-line bg-panel text-amber transition-transform active:scale-90"
    >
      <Icon name={theme === "night" ? "moon" : "sun"} />
    </button>
  );
}
