import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// La llamada de visión a la IA puede tardar varios segundos: ampliamos el límite.
export const maxDuration = 30;

// Escaneo de facturas que la cooperativa emite en nombre del autónomo. Extrae
// número, fecha, cliente final e importes para registrarlas en la app. NO
// genera Verifactu: solo lee datos de una factura ya emitida por la coop.

const ExtractSchema = z.object({
  numero: z.string().nullable(),
  fecha: z.string().nullable(),
  cliente: z.string().nullable(),
  cliente_nif: z.string().nullable(),
  concepto: z.string().nullable(),
  base: z.number().nullable(),
  iva: z.number().nullable(),
  iva_rate: z.number().nullable(),
  irpf: z.number().nullable(),
  irpf_rate: z.number().nullable(),
  total: z.number().nullable(),
  confianza: z.number(),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    numero: { type: ["string", "null"], description: "Número de la factura tal cual aparece" },
    fecha: { type: ["string", "null"], description: "Fecha YYYY-MM-DD" },
    cliente: { type: ["string", "null"], description: "Nombre del destinatario / cliente final" },
    cliente_nif: { type: ["string", "null"], description: "NIF/CIF del destinatario" },
    concepto: { type: ["string", "null"], description: "Concepto o descripción del servicio" },
    base: { type: ["number", "null"], description: "Base imponible en euros" },
    iva: { type: ["number", "null"], description: "Cuota de IVA en euros" },
    iva_rate: { type: ["number", "null"], description: "Tipo de IVA en %" },
    irpf: { type: ["number", "null"], description: "Retención de IRPF en euros (si la hay)" },
    irpf_rate: { type: ["number", "null"], description: "Tipo de retención IRPF en %" },
    total: { type: ["number", "null"], description: "Importe total a pagar en euros" },
    confianza: { type: "number", description: "Confianza global de 0 a 1" },
  },
  required: [
    "numero",
    "fecha",
    "cliente",
    "cliente_nif",
    "concepto",
    "base",
    "iva",
    "iva_rate",
    "irpf",
    "irpf_rate",
    "total",
    "confianza",
  ],
} as const;

const SYSTEM = `Eres un asistente que extrae datos de una factura de transporte emitida por una
cooperativa en nombre de un camionero autónomo español (facturación por terceros).
El EMISOR es el propio autónomo; quieres los datos del DESTINATARIO (cliente final) y los importes.
Reglas:
- Importes como número en euros con punto decimal (ej. 1234.56). Sin símbolo de moneda.
- fecha en formato YYYY-MM-DD. Si no la ves, null.
- numero: el número de factura completo (con su serie si la lleva).
- cliente: el destinatario de la factura (NO la cooperativa ni el autónomo emisor).
- irpf: la retención de IRPF en euros si aparece (en transporte suele ser 15% o 7%); si no hay, null.
- Si un dato no es legible, ponlo a null. confianza refleja lo seguro que estás (0 a 1).`;

const BodySchema = z.object({
  imageBase64: z.string().min(10).max(7_000_000),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "El escaneo con IA no está configurado en el servidor." },
      { status: 503 },
    );
  }

  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Imagen no válida" }, { status: 400 });
  }

  // Mismo límite de uso por usuario que el escaneo de gastos (anti-abuso / coste).
  const { data: allowed, error: rlError } = await supabase.rpc("allow_ai_scan", {});
  if (rlError || allowed === false) {
    return Response.json(
      { error: "Has hecho demasiados escaneos seguidos. Espera un momento e inténtalo de nuevo." },
      { status: 429 },
    );
  }

  try {
    const client = new Anthropic();
    // Salida estructurada mediante TOOL USE (forma soportada por la API).
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM,
      tools: [
        {
          name: "registrar_factura",
          description: "Registra los datos extraídos de la factura.",
          input_schema: JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "registrar_factura" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: body.mediaType, data: body.imageBase64 },
            },
            { type: "text", text: "Extrae los datos de esta factura de la cooperativa." },
          ],
        },
      ],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const input = toolUse && toolUse.type === "tool_use" ? toolUse.input : undefined;
    const parsed = ExtractSchema.safeParse(input);
    if (!parsed.success) {
      return Response.json({ error: "La IA no devolvió datos legibles de la factura." }, { status: 502 });
    }
    return Response.json({ data: parsed.data });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[invoices/scan] Anthropic", e.status, e.message);
      if (e.status === 401)
        return Response.json({ error: "La clave de Anthropic no es válida. Revísala en Vercel." }, { status: 502 });
      if (e.status === 404)
        return Response.json({ error: "El modelo de IA no está disponible para tu clave." }, { status: 502 });
      if (e.status === 429)
        return Response.json({ error: "La API de IA está saturada. Espera unos segundos e inténtalo." }, { status: 502 });
      if (e.status === 400)
        return Response.json({ error: "Anthropic rechazó la petición (revisa que la cuenta tenga saldo)." }, { status: 502 });
    } else {
      console.error("[invoices/scan] error:", e);
    }
    return Response.json({ error: "No se pudo leer la factura. Inténtalo de nuevo." }, { status: 502 });
  }
}
