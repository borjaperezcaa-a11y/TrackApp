import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { routeKm, routingEnabled } from "@/lib/routing";

const Coord = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
const BodySchema = z.object({ from: Coord, to: Coord });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  // Rate-limit anti-abuso de la cuota de OpenRouteService. Bloquea solo con un
  // false explícito (fail-open si la RPC aún no está aplicada → no rompe la app).
  const { data: rlOk } = await supabase.rpc("allow_api_call", { p_bucket: "distance", p_per_min: 30 });
  if (rlOk === false) return Response.json({ error: "Demasiadas peticiones. Espera un momento." }, { status: 429 });

  if (!routingEnabled()) {
    return Response.json({ error: "El cálculo de ruta no está configurado." }, { status: 503 });
  }

  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Coordenadas no válidas" }, { status: 400 });
  }

  try {
    const km = await routeKm(body.from, body.to);
    return Response.json({ km });
  } catch (e) {
    console.error("[api/distance] error:", e);
    return Response.json({ error: "No se pudo calcular la ruta." }, { status: 502 });
  }
}
