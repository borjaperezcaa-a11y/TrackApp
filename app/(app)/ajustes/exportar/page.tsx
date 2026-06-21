import { PageHeader } from "@/components/ui/PageHeader";
import { ExportData } from "./ExportData";

export const metadata = { title: "Exportar registros · TrackApp" };

export default function ExportarPage() {
  return (
    <>
      <PageHeader title="Exportar registros" kicker="Verifactu · Art. 8.2.c" fallbackHref="/ajustes" />
      <p className="mb-4 px-1 text-[12.5px] text-dim">
        Descarga y archivo seguro de tus registros de facturación, para conservarlos durante los
        plazos legales y poder aportarlos a la Administración o a tu asesoría.
      </p>
      <ExportData />
    </>
  );
}
