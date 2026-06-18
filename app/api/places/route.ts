import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { geocodeAutocomplete, routingEnabled } from "@/lib/routing";

const QuerySchema = z.object({ text: z.string().trim().min(3).max(120) });

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  // Rate-limit anti-abuso (autocompletado). Bloquea solo con false explícito.
  const { data: rlOk } = await supabase.rpc("allow_api_call", { p_bucket: "places", p_per_min: 90 });
  if (rlOk === false) return Response.json({ places: [] });

  if (!routingEnabled()) {
    return Response.json({ error: "El buscador de lugares no está configurado." }, { status: 503 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ text: url.searchParams.get("text") ?? "" });
  if (!parsed.success) return Response.json({ places: [] });

  try {
    const places = await geocodeAutocomplete(parsed.data.text);
    return Response.json({ places });
  } catch (e) {
    console.error("[api/places] error:", e);
    return Response.json({ error: "No se pudieron buscar lugares." }, { status: 502 });
  }
}
