"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { clsx } from "@/lib/clsx";

type Tab = { href: string; label: string; icon: IconName };

const TABS: Tab[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/viajes", label: "Viajes", icon: "truck" },
  { href: "/facturas", label: "Facturación", icon: "doc" },
  { href: "/gastos", label: "Gastos", icon: "euro" },
  { href: "/ajustes/perfil", label: "Mi Perfil", icon: "user" },
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
                  "flex min-h-[60px] flex-col items-center justify-center gap-1.5 rounded-2xl px-0.5 py-2 text-[11px] font-bold leading-none tracking-tight transition-colors",
                  active ? "text-amber" : "text-dim",
                )}
              >
                <Icon name={t.icon} size={25} />
                <span className="max-w-full truncate">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
