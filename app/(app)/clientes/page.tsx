import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Fab } from "@/components/ui/Fab";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";

export const metadata = { title: "Clientes · TrackApp" };

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("nombre");
  const clients = (data ?? []) as Client[];

  return (
    <>
      <PageHeader title="Clientes" kicker="Tu cartera" />

      {clients.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Aún no tienes clientes</p>
          <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
            Crea tu primer cliente para poder asignarle viajes y emitir facturas.
          </p>
          <Link
            href="/clientes/nuevo"
            className="mt-5 inline-flex rounded-2xl bg-amber px-5 py-3 text-sm font-extrabold text-[#1a1205]"
          >
            Nuevo cliente
          </Link>
        </div>
      ) : (
        <div className="stagger">
          {clients.map((c) => (
            <Row
              key={c.id}
              href={`/clientes/${c.id}`}
              avatar={initials(c.nombre)}
              title={c.nombre}
              subtitle={[c.nif, c.condiciones_pago].filter(Boolean).join(" · ") || undefined}
            />
          ))}
        </div>
      )}

      <Fab href="/clientes/nuevo" label="Nuevo cliente" />
    </>
  );
}
