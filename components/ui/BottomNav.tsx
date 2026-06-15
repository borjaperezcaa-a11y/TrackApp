"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { clsx } from "@/lib/clsx";

type Tab = { href: string; label: string; icon: IconName };

const TABS: Tab[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/viajes", label: "Viajes", icon: "truck" },
  { href: "/facturas", label: "Facturas", icon: "doc" },
  { href: "/gastos", label: "Gastos", icon: "euro" },
  { href: "/estadisticas", label: "Stats", icon: "chart" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Barra de navegación inferior fija (zona del pulgar). Presente en todas las
 *  pantallas de la app; resalta la sección activa. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-chrome/95 px-1.5 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl py-1.5 text-[10.5px] font-bold transition-colors",
                  active ? "text-amber" : "text-dim",
                )}
              >
                <Icon name={t.icon} size={23} />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
