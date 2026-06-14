"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register, type AuthState } from "../login/actions";

const initial: AuthState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(register, initial);

  return (
    <main className="shell flex min-h-dvh flex-col justify-center">
      <div className="stagger">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl font-bold tracking-wide text-amber">TrackApp</h1>
          <p className="mt-2 text-sm text-dim">Crea tu cuenta.</p>
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
            autoComplete="new-password"
            required
            className="mb-4"
          />

          {state.error && (
            <p className="mb-3 rounded-xl bg-red-soft px-3 py-2 text-sm font-semibold text-red">
              {state.error}
            </p>
          )}
          {state.message && (
            <p className="mb-3 rounded-xl bg-green-soft px-3 py-2 text-sm font-semibold text-green">
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex min-h-[60px] w-full items-center justify-center rounded-[18px] bg-amber px-5 py-4 text-[17px] font-extrabold text-[#1a1205] transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            {pending ? "Creando…" : "CREAR CUENTA"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-dim">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-bold text-amber">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
