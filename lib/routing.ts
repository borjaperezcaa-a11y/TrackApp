/**
 * Integración con OpenRouteService (https://openrouteservice.org) para:
 *   1) Autocompletar lugares (geocoding) mientras se escribe origen/destino.
 *   2) Calcular los km de la ruta entre dos puntos con perfil de CAMIÓN.
 *
 * La clave (OPENROUTESERVICE_API_KEY) es SOLO de servidor: nunca se expone al
 * navegador. Estas funciones se llaman desde rutas API (app/api/...), no desde el
 * cliente. Si no hay clave configurada, la función de disponibilidad devuelve
 * false y la app degrada con elegancia (origen/destino como texto libre y km a
 * mano), igual que el escaneo con IA.
 */

const ORS = "https://api.openrouteservice.org";

export type Place = { label: string; lon: number; lat: number };
export type Coord = { lon: number; lat: number };

function apiKey(): string | undefined {
  return process.env.OPENROUTESERVICE_API_KEY;
}

/** ¿Está el routing configurado en el servidor? */
export function routingEnabled(): boolean {
  return Boolean(apiKey());
}

/**
 * Sugerencias de lugares para un texto parcial. Devuelve hasta 5 resultados con
 * sus coordenadas. No se restringe a España: un camionero hace rutas
 * internacionales (la propia app sugiere "Parma - IT" como destino).
 */
export async function geocodeAutocomplete(text: string): Promise<Place[]> {
  const key = apiKey();
  if (!key) return [];
  // layers=coarse → solo lugares "gruesos" (localidad, municipio, provincia,
  // región), NO direcciones ni puntos de interés concretos. Así el usuario elige
  // pueblo/provincia y la ruta de camión se calcula de centro a centro, evitando
  // los puntos en zona peatonal que no son transitables para camión.
  // lang=es → nombres en español; layers=coarse → localidades/provincias.
  // boundary.rect → restringe a un recuadro de EUROPA (excluye América, etc.).
  // focus.point (España) → sesga para que las ciudades de aquí salgan primero.
  const EUROPA = "boundary.rect.min_lon=-11&boundary.rect.min_lat=34&boundary.rect.max_lon=40&boundary.rect.max_lat=71";
  const FOCO_ES = "focus.point.lon=-3.70&focus.point.lat=40.42";
  const url = `${ORS}/geocode/autocomplete?text=${encodeURIComponent(text)}&size=6&layers=coarse&lang=es&${EUROPA}&${FOCO_ES}`;
  // Timeout: si ORS tarda/cuelga, no bloqueamos la petición indefinidamente.
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`ORS geocode ${res.status}`);
  const data = (await res.json()) as {
    features?: {
      properties?: { label?: string; name?: string; locality?: string; region?: string; postalcode?: string };
      geometry?: { coordinates?: [number, number] };
    }[];
  };
  return (data.features ?? [])
    .map((f) => {
      const p = f.properties ?? {};
      const name = p.name || p.locality || p.label || "";
      // ORS no da un CP único por localidad española (un pueblo tiene varios).
      // Mostramos entre paréntesis el CP si excepcionalmente viene, y si no la
      // PROVINCIA, que identifica el municipio igual de bien: "Silleda (Pontevedra)".
      const extra = p.postalcode || p.region || "";
      const label = extra ? `${name} (${extra})` : p.label || name;
      return {
        label,
        lon: f.geometry?.coordinates?.[0] ?? NaN,
        lat: f.geometry?.coordinates?.[1] ?? NaN,
      };
    })
    .filter((p) => p.label !== "" && Number.isFinite(p.lon) && Number.isFinite(p.lat));
}

/**
 * Km de carretera entre dos coordenadas. Intenta primero el perfil de CAMIÓN
 * (driving-hgv) y, si ese no encuentra ruta (p. ej. un extremo sin vía de camión
 * cerca), recurre a coche (driving-car) para dar al menos un km aproximado.
 * `radiuses: [-1, -1]` deja a ORS ajustar cada punto a la carretera más cercana
 * sin límite de distancia, evitando el error "punto no encontrado". Redondea al km.
 */
export async function routeKm(from: Coord, to: Coord): Promise<number> {
  const key = apiKey();
  if (!key) throw new Error("routing no configurado");
  const body = JSON.stringify({
    coordinates: [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ],
    radiuses: [-1, -1],
  });

  let lastErr = "";
  for (const profile of ["driving-hgv", "driving-car"]) {
    const res = await fetch(`${ORS}/v2/directions/${profile}`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(6000), // no bloquear si ORS tarda/cuelga
    });
    if (res.ok) {
      const data = (await res.json()) as { routes?: { summary?: { distance?: number } }[] };
      const meters = data?.routes?.[0]?.summary?.distance;
      if (Number.isFinite(meters)) return Math.round((meters as number) / 1000);
      lastErr = `${profile}: sin distancia`;
      continue;
    }
    // Guardamos el motivo real de ORS para diagnóstico; probamos el siguiente perfil.
    lastErr = `${profile} ${res.status}: ${(await res.text()).slice(0, 200)}`;
  }
  throw new Error(`ORS sin ruta — ${lastErr}`);
}
