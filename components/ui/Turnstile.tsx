"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove?: (id: string) => void;
    };
  }
}

/**
 * Widget de Cloudflare Turnstile (CAPTCHA anti fuerza bruta en login/registro).
 *
 * SEGURO POR DISEÑO: solo se muestra si está configurada NEXT_PUBLIC_TURNSTILE_SITE_KEY.
 * Sin esa variable no renderiza nada y el acceso funciona igual que hoy → desplegar
 * esto NO rompe nada. Para activarlo: poner la site key en Vercel + habilitar Turnstile
 * en Supabase con la secret key.
 *
 * Turnstile, al resolverse, inyecta un input oculto "cf-turnstile-response" con el
 * token en el <form> contenedor; las server actions de login/registro lo leen y lo
 * pasan a Supabase como captchaToken.
 */
export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || widgetId.current !== null) return;
      if (window.turnstile && ref.current) {
        widgetId.current = window.turnstile.render(ref.current, { sitekey: siteKey, theme: "auto" });
      } else {
        setTimeout(render, 200); // el script aún no ha cargado: reintenta
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={ref} className="mb-4 flex justify-center" aria-label="Verificación de seguridad" />
    </>
  );
}
