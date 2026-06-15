import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { SISTEMA, CUMPLIMIENTO_HECHO, CUMPLIMIENTO_PENDIENTE } from "@/lib/declaracion";

export const metadata = { title: "Declaración responsable · TrackApp" };

export default function DeclaracionPage() {
  const s = SISTEMA;

  return (
    <>
      <PageHeader title="Declaración responsable" kicker="Verifactu · Art. 13" fallbackHref="/ajustes/perfil" />

      {!s.cumpleIntegramente && (
        <p className="mb-3.5 rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-[12.5px] font-semibold text-amber">
          BORRADOR. Esta declaración aún <b>no puede firmarse ni presentarse como definitiva</b>: el
          sistema todavía no cumple íntegramente el RD 1007/2023 (faltan la remisión a la AEAT y la
          firma de los registros). Sirve como plantilla con la estructura del Art. 13.
        </p>
      )}

      {/* Datos del productor (Art. 13.4) */}
      <Card className="mb-3.5">
        <SectionTitle>Productor del sistema</SectionTitle>
        <Dato k="Nombre / razón social" v={s.productorNombre} />
        <Dato k="NIF" v={s.productorNif} />
        <Dato k="Contacto" v={s.productorContacto} />
      </Card>

      {/* Datos del sistema (Art. 13.4) */}
      <Card className="mb-3.5">
        <SectionTitle>Sistema informático</SectionTitle>
        <Dato k="Denominación" v={s.nombre} />
        <Dato k="Versión" v={s.version} />
        <Dato k="Tipología" v={s.tipologia} />
      </Card>

      {/* Declaración */}
      <Card className="mb-3.5">
        <SectionTitle>Declaración</SectionTitle>
        <p className="text-[13px] leading-relaxed text-text">
          El productor identificado declara, bajo su responsabilidad, que el sistema informático
          arriba descrito {s.cumpleIntegramente ? "cumple" : <b>cumplirá (una vez completado)</b>} lo
          dispuesto en el artículo 29.2.j) de la Ley 58/2003, General Tributaria, y en el Reglamento
          aprobado por el Real Decreto 1007/2023, de 5 de diciembre, así como en su normativa de
          desarrollo (Orden HAC/1177/2024).
        </p>
      </Card>

      {/* Funcionalidades */}
      <Card className="mb-3.5">
        <SectionTitle>Funcionalidades de cumplimiento implementadas</SectionTitle>
        <ul className="space-y-1.5">
          {CUMPLIMIENTO_HECHO.map((f) => (
            <li key={f} className="flex gap-2 text-[12.5px] text-text">
              <span className="text-green">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </Card>

      {CUMPLIMIENTO_PENDIENTE.length > 0 && (
        <Card className="mb-3.5">
          <SectionTitle>Pendiente para la conformidad plena</SectionTitle>
          <ul className="space-y-1.5">
            {CUMPLIMIENTO_PENDIENTE.map((f) => (
              <li key={f} className="flex gap-2 text-[12.5px] text-dim">
                <span className="text-amber">○</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Firma */}
      <Card className="mb-3.5">
        <SectionTitle>Lugar, fecha y firma</SectionTitle>
        <Dato k="Lugar" v={s.lugarFirma} />
        <Dato k="Fecha" v={s.cumpleIntegramente ? "—" : "Pendiente"} />
        <Dato k="Firma del productor" v={s.cumpleIntegramente ? "—" : "Pendiente"} />
      </Card>

      <p className="px-1 pb-2 text-[11.5px] text-dim">
        Esta declaración debe conservarse y entregarse al cliente o a la Administración tributaria que
        la solicite (Art. 13.3), y mantenerse actualizada en cada versión del sistema (Art. 13.2).
      </p>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-dim">{children}</div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-[12px] text-dim">{k}</span>
      <span className="text-right text-[13px] font-semibold text-text">{v}</span>
    </div>
  );
}
