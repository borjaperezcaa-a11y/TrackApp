"use client";

import { useEffect } from "react";

/** Registra el service worker en producción para que la app sea instalable. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin SW la app sigue funcionando online */
    });
  }, []);

  return null;
}
