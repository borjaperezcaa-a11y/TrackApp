import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Row } from "@/components/ui/Row";
import { Icon } from "@/components/ui/Icon";
import { LoadError } from "@/components/ui/LoadError";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Camiones · TrackApp" };

export default async function CamionesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehiculos").select("id, nombre, matricula").order("nombre");
  const vehiculos = (data ?? []) as { id: string; nombre: string; matricula: string | null }[];

  return (
    <>
      <PageHeader title="Camiones" kicker="Tu flota" actionHref="/camiones/nuevo" actionLabel="Nuevo camión" />

      {error ? (
        <LoadError />
      ) : vehiculos.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Aún no tienes camiones</p>
          <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-dim">
            Da de alta tus camiones para asignar cada viaje al que lo hizo.
          </p>
          <Link
            href="/camiones/nuevo"
            className="mt-5 inline-flex rounded-2xl bg-amber px-5 py-3 text-sm font-extrabold text-[#1a1205]"
          >
            Nuevo camión
          </Link>
        </div>
      ) : (
        <div className="stagger">
          {vehiculos.map((v) => (
            <Row
              key={v.id}
              href={`/camiones/${v.id}`}
              icon={<Icon name="rig" />}
              title={v.nombre}
              subtitle={v.matricula ?? undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}
