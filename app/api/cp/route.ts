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
    // Un mismo CP existe en varios países (p. ej. 43122 = Tarragona ES y Parma IT).
    // Buscamos en España Y en el resto en paralelo y fusionamos (España primero),
    // para que el usuario pueda ELEGIR cuál es si hay varios candidatos.
    const [esPcs, worldPcs] = await Promise.all([fetchPC("ES"), fetchPC()]);

    const seen = new Set<string>();
    const places: { nombre: string; provincia: string; pais: string; lat: number | null; lon: number | null }[] = [];
    for (const p of [...esPcs, ...worldPcs]) {
      const nombre = p.adminName3 || p.placeName || "";
      if (!nombre) continue;
      const provincia = p.adminName2 || p.adminName1 || "";
      const pais = p.countryCode || "";
      const key = `${nombre}|${provincia}|${pais}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({ nombre, provincia, pais, lat: toNum(p.lat), lon: toNum(p.lng) });
      if (places.length >= 8) break;
    }

    // El primero (España si la hay) es el valor por defecto; `places` permite elegir.
    const first = places[0];
    return Response.json({
      localidad: first?.nombre ?? null,
      lat: first?.lat ?? null,
      lon: first?.lon ?? null,
      places,
    });
  } catch {
    return Response.json({ localidad: null, lat: null, lon: null, places: [] });
  }
}
