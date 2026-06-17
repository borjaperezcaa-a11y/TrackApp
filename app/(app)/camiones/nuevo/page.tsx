import { PageHeader } from "@/components/ui/PageHeader";
import { VehiculoForm } from "../VehiculoForm";
import { createVehiculoAction } from "../actions";

export const metadata = { title: "Nuevo camión · TrackApp" };

export default function NuevoCamionPage() {
  return (
    <>
      <PageHeader title="Nuevo camión" kicker="Camiones" fallbackHref="/camiones" />
      <VehiculoForm action={createVehiculoAction} values={{ nombre: "", matricula: "" }} submitLabel="CREAR CAMIÓN" />
    </>
  );
}
