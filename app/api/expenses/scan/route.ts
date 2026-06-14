import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES } from "@/lib/expense";

// Validación de la respuesta de la IA (Zod v3). El SDK recibe un JSON Schema crudo.
const ExtractSchema = z.object({
  total: z.number().nullable(),
  base: z.number().nullable(),
  iva: z.number().nullable(),
  iva_rate: z.number().nullable(),
  fecha: z.string().nullable(),
  establecimiento: z.string().nullable(),
  categoria: z.enum([...EXPENSE_CATEGORIES] as [string, ...string[]]).nullable(),
  confianza: z.number(),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    total: { type: ["number", "null"], description: "Importe total en euros" },
    base: { type: ["number", "null"], description: "Base imponible en euros" },
    iva: { type: ["number", "null"], description: "Cuota de IVA en euros" },
    iva_rate: { type: ["number", "null"], description: "Tipo de IVA en %" },
    fecha: { type: ["string", "null"], description: "Fecha YYYY-MM-DD" },
    establecimiento: { type: ["string", "null"], description: "Estación o comercio" },
    categoria: {
      anyOf: [{ type: "string", enum: [...EXPENSE_CATEGORIES] }, { type: "null" }],
    },
    confianza: { type: "number", description: "Confianza global de 0 a 1" },
  },
  required: [
    "total",
    "base",
    "iva",
    "iva_rate",
    "fecha",
    "establecimiento",
    "categoria",
    "confianza",
  ],
} as const;

const SYSTEM = `Eres un asistente que extrae datos de tickets de gasto de un camionero autónomo español
(gasoil, peaje, AdBlue, taller, dieta, parking…). Devuelve SOLO los datos del esquema.
Reglas:
- Importes como número en euros con punto decimal (ej. 87.40). Sin símbolo de moneda.
- fecha en formato YYYY-MM-DD. Si no la ves, null.
- categoria: una de Gasoil, Peaje, Taller, AdBlue, Dieta, Parking, Otro (gasóleo/diésel = Gasoil).
- Si un dato no es legible, ponlo a null. confianza refleja lo seguro que estás (0 a 1).`;

const BodySchema = z.object({
  imageBase64: z.string().min(10).max(11_000_000),
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

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: body.mediaType, data: body.imageBase64 },
            },
            { type: "text", text: "Extrae los datos de este ticket de gasto." },
          ],
        },
      ],
      // Salida estructurada con JSON Schema crudo (no requiere Zod v4).
      output_config: { format: { type: "json_schema", name: "gasto", schema: JSON_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    // Robustez: aislar el objeto JSON aunque venga con texto o fences alrededor.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) {
      return Response.json({ error: "Respuesta de IA no válida" }, { status: 502 });
    }
    const parsed = ExtractSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    if (!parsed.success) {
      return Response.json({ error: "Respuesta de IA no válida" }, { status: 502 });
    }
    return Response.json({ data: parsed.data });
  } catch {
    return Response.json({ error: "No se pudo leer el ticket. Inténtalo de nuevo." }, { status: 502 });
  }
}
