"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthState } from "./actions";

const initial: AuthState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <main className="shell flex min-h-dvh flex-col justify-center">
      <div className="stagger">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl font-bold tracking-wide text-amber">TrackApp</h1>
          <p className="mt-2 text-sm text-dim">Gestión y facturación para la cabina.</p>
        </div>

        <form
          action={formAction}
          className="rounded-[20px] border border-line bg-panel p-5 shadow-[var(--shadow)]"
        >
          <label className="mb-2 block px-1 text-xs font-bold uppercase tracking-[0.1em] text-dim">
            Email
          </label>
          <input name="email" type="email" autoComplete="email" required className="mb-4" />

          <label className="mb-2 block px-1 text-xs font-bold uppercase tracking-[0.1em] text-dim">
            Contraseña
          </label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mb-4"
          />

          {state.error && (
            <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex min-h-[60px] w-full items-center justify-center rounded-[18px] bg-amber px-5 py-4 text-[17px] font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            {pending ? "Entrando…" : "ENTRAR"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-dim">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="font-bold text-amber">
            Crear cuenta
          </Link>
        </p>
      </div>
    </main>
  );
}
