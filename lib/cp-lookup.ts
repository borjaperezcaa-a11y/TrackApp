/** Un candidato de localidad para un código postal (puede haber varios países). */
export type CpPlace = {
  nombre: string;
  provincia: string;
  pais: string; // código ISO de país (ES, IT, FR…)
  lat: number | null;
  lon: number | null;
};

export type CpResult = {
  localidad: string | null; // mejor candidato (España si la hay)
  lat: number | null;
  lon: number | null;
  places: CpPlace[]; // todos los candidatos, para elegir cuando hay varios
};

/** CP → localidad + coordenadas + candidatos (vía /api/cp · GeoNames). Cliente. */
export async function lookupCp(cp: string): Promise<CpResult> {
  const c = cp.trim();
  const vacio: CpResult = { localidad: null, lat: null, lon: null, places: [] };
  if (c.length < 4) return vacio;
  try {
    const res = await fetch(`/api/cp?cp=${encodeURIComponent(c)}`);
    if (!res.ok) return vacio;
    const data = (await res.json()) as Partial<CpResult>;
    return {
      localidad: data.localidad ?? null,
      lat: data.lat ?? null,
      lon: data.lon ?? null,
      places: Array.isArray(data.places) ? data.places : [],
    };
  } catch {
    return vacio;
  }
}
