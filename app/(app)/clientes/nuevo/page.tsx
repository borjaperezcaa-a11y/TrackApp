import { PageHeader } from "@/components/ui/PageHeader";
import { ClientForm } from "../ClientForm";
import { createClientAction } from "../actions";

export const metadata = { title: "Nuevo cliente · TrackApp" };

const empty = {
  nombre: "",
  nif: "",
  direccion: "",
  cp_localidad: "",
  condiciones_pago: "",
};

export default function NuevoClientePage() {
  return (
    <>
      <PageHeader title="Nuevo cliente" kicker="Clientes" fallbackHref="/clientes" />
      <ClientForm action={createClientAction} values={empty} submitLabel="CREAR CLIENTE" />
    </>
  );
}
