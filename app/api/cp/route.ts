import { createClient } from "@/lib/supabase/server";

/**
 * CP → localidad (GeoNames, cobertura europea). El "username" de GeoNames se lee
 * del servidor (GEONAMES_USERNAME). Prioriza España (un mismo CP existe en varios
 * países); si el CP no está en España, busca en el resto (rutas europeas).
 * Degrada con elegancia si GeoNames no está configurado o falla.
 */
type PC = {
  placeName?: string;
  adminName3?: string;
  adminName2?: string;
  adminName1?: string;
  countryCode?: string;
  lat?: number | string;
  lng?: number | string;
};

const toNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  // Rate-limit anti-abuso de la cuota de GeoNames. Bloquea solo con false explícito.
  const { data: rlOk } = await supabase.rpc("allow_api_call", { p_bucket: "cp", p_per_min: 40 });
  if (rlOk === false) return Response.json({ error: "Demasiadas consultas. Espera un momento." }, { status: 429 });

  const username = process.env.GEONAMES_USERNAME;
  if (!username) return Response.json({ error: "GeoNames no configurado" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const cp = (searchParams.get("cp") ?? "").trim();
  if (!/^[0-9A-Za-z -]{3,12}$/.test(cp)) return Response.json({ error: "CP no válido" }, { status: 400 });

  const fetchPC = async (country?: string): Promise<PC[]> => {
    const url =
      `https://secure.geonames.org/postalCodeLookupJSON?postalcode=${encodeURIComponent(cp)}&maxRows=10` +
      (country ? `&country=${country}` : "") +
      `&username=${encodeURIComponent(username)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const data = (await res.json()) as { postalcodes?: PC[] };
      return data.postalcodes ?? [];
    } catch {
      return [];
    }
  };

  try {
    // 1) España primero. 2) Si no hay, el resto (Europa/mundo).
    let pcs = await fetchPC("ES");
    const esEspana = pcs.length > 0;
    if (!esEspana) pcs = await fetchPC();

    const first = pcs[0];
    // En España el municipio está en adminName3; fuera, la ciudad suele ser placeName.
    const localidad = first
      ? esEspana
        ? first.adminName3 || first.placeName || null
        : first.placeName || first.adminName3 || null
      : null;

    const places = pcs
      .filter((p) => p.placeName || p.adminName3)
      .map((p) => ({ nombre: p.adminName3 || p.placeName || "", provincia: p.adminName2 || p.adminName1 || "", pais: p.countryCode || "" }));

    // Coordenadas del CP (para calcular los km del viaje sin tener que elegir en el buscador).
    const lat = first ? toNum(first.lat) : null;
    const lon = first ? toNum(first.lng) : null;

    return Response.json({ localidad, lat, lon, places });
  } catch {
    return Response.json({ localidad: null, places: [] });
  }
}
