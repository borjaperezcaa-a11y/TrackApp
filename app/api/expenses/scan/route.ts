import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES } from "@/lib/expense";

// La llamada de visión a la IA puede tardar varios segundos: ampliamos el límite
// de la función (si no, Vercel la corta y el cliente ve un error genérico).
export const maxDuration = 30;

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
  imageBase64: z.string().min(10).max(7_000_000), // ~5 MB binario
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

  // Límite de uso por usuario (anti-abuso / coste de la API de IA).
  const { data: allowed, error: rlError } = await supabase.rpc("allow_ai_scan", {});
  if (rlError || allowed === false) {
    return Response.json(
      { error: "Has hecho demasiados escaneos seguidos. Espera un momento e inténtalo de nuevo." },
      { status: 429 },
    );
  }

  try {
    const client = new Anthropic();
    // Salida estructurada mediante TOOL USE (la forma soportada por la API de
    // Anthropic): se define una herramienta cuyo input_schema es nuestro esquema
    // y se fuerza su uso; la respuesta llega en el bloque tool_use.input.
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM,
      tools: [
        {
          name: "registrar_gasto",
          description: "Registra los datos extraídos del ticket de gasto.",
          input_schema: JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "registrar_gasto" },
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
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const input = toolUse && toolUse.type === "tool_use" ? toolUse.input : undefined;
    const parsed = ExtractSchema.safeParse(input);
    if (!parsed.success) {
      return Response.json({ error: "La IA no devolvió datos legibles del ticket." }, { status: 502 });
    }
    return Response.json({ data: parsed.data });
  } catch (e) {
    // Mensaje accionable según el tipo de error de la API de Anthropic (sin
    // filtrar detalles internos): el detalle completo queda en los logs.
    if (e instanceof Anthropic.APIError) {
      console.error("[expenses/scan] Anthropic", e.status, e.message);
      if (e.status === 401)
        return Response.json({ error: "La clave de Anthropic no es válida. Revísala en Vercel." }, { status: 502 });
      if (e.status === 404)
        return Response.json({ error: "El modelo de IA no está disponible para tu clave." }, { status: 502 });
      if (e.status === 429)
        return Response.json({ error: "La API de IA está saturada. Espera unos segundos e inténtalo." }, { status: 502 });
      if (e.status === 400)
        return Response.json({ error: "Anthropic rechazó la petición (revisa que la cuenta tenga saldo)." }, { status: 502 });
    } else {
      console.error("[expenses/scan] error:", e);
    }
    return Response.json({ error: "No se pudo leer el ticket. Inténtalo de nuevo." }, { status: 502 });
  }
}
