import { createClient } from "@/lib/supabase/server";

/**
 * CP → localidad (GeoNames, cobertura europea). El "username" de GeoNames se lee
 * del servidor (GEONAMES_USERNAME). Si no está configurado, degrada con elegancia
 * (la app sigue dejando escribir la localidad a mano).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  const username = process.env.GEONAMES_USERNAME;
  if (!username) return Response.json({ error: "GeoNames no configurado" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const cp = (searchParams.get("cp") ?? "").trim();
  if (!/^[0-9A-Za-z -]{3,12}$/.test(cp)) return Response.json({ error: "CP no válido" }, { status: 400 });

  try {
    const url = `http://api.geonames.org/postalCodeLookupJSON?postalcode=${encodeURIComponent(cp)}&maxRows=5&username=${encodeURIComponent(username)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return Response.json({ places: [] });
    const data = (await res.json()) as {
      postalcodes?: { placeName?: string; adminName2?: string; adminName1?: string; countryCode?: string }[];
    };
    const places = (data.postalcodes ?? [])
      .filter((p) => p.placeName)
      .map((p) => ({ nombre: p.placeName as string, provincia: p.adminName2 || p.adminName1 || "", pais: p.countryCode || "" }));
    return Response.json({ places });
  } catch {
    return Response.json({ places: [] });
  }
}
