/** CP → localidad + coordenadas (vía /api/cp · GeoNames). Cliente. */
export async function lookupCp(cp: string): Promise<{ localidad: string | null; lat: number | null; lon: number | null }> {
  const c = cp.trim();
  const vacio = { localidad: null, lat: null, lon: null };
  if (c.length < 4) return vacio;
  try {
    const res = await fetch(`/api/cp?cp=${encodeURIComponent(c)}`);
    if (!res.ok) return vacio;
    const data = (await res.json()) as { localidad?: string | null; lat?: number | null; lon?: number | null };
    return { localidad: data.localidad ?? null, lat: data.lat ?? null, lon: data.lon ?? null };
  } catch {
    return vacio;
  }
}
