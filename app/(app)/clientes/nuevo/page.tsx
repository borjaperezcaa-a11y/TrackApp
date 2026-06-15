import { PageHeader } from "@/components/ui/PageHeader";
import { ClientForm } from "../ClientForm";
import { createClientAction } from "../actions";

export const metadata = { title: "Nuevo cliente · TrackApp" };

export default async function NuevoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; nombre?: string }>;
}) {
  const sp = await searchParams;
  // `next` solo se acepta si es una ruta interna (anti open-redirect).
  const next = typeof sp.next === "string" && /^\/(?![/\\])/.test(sp.next) ? sp.next : undefined;
  const nombre = typeof sp.nombre === "string" ? sp.nombre.slice(0, 120) : "";

  return (
    <>
      <PageHeader title="Nuevo cliente" kicker="Clientes" fallbackHref={next ?? "/clientes"} />
      <ClientForm
        action={createClientAction}
        values={{ nombre, nif: "", direccion: "", cp_localidad: "", condiciones_pago: "" }}
        submitLabel="CREAR CLIENTE"
        next={next}
      />
    </>
  );
}
