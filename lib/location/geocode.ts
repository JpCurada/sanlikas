import { isInNcr, NCR_CENTER, NCR_NE, NCR_SW, type LngLat } from '@/lib/geo/ncr';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export interface GeocodeResult {
  /** Display name, e.g. "Espana Boulevard, Sampaloc, Manila". */
  name: string;
  coordinate: LngLat;
}

/**
 * Forward-geocode a query to Metro Manila places via the Mapbox Geocoding API.
 * Restricted to the NCR bbox and biased to its center, so a resident can type a
 * street, barangay, or landmark and get their location when GPS is unavailable.
 *
 * Results outside NCR are filtered out (belt-and-suspenders over the bbox), so
 * the returned coordinate is always a valid routing origin.
 */
export async function geocodeNcr(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q || !MAPBOX_TOKEN) return [];

  const bbox = `${NCR_SW[0]},${NCR_SW[1]},${NCR_NE[0]},${NCR_NE[1]}`;
  const proximity = `${NCR_CENTER[0]},${NCR_CENTER[1]}`;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&country=PH&bbox=${bbox}&proximity=${proximity}&limit=6&language=en`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
  const json = (await res.json()) as { features?: GeocodeFeature[] };

  return (json.features ?? [])
    .map((f) => ({
      name: f.place_name ?? f.text ?? 'Unknown place',
      coordinate: f.center as LngLat,
    }))
    .filter((r) => Array.isArray(r.coordinate) && isInNcr(r.coordinate));
}

interface GeocodeFeature {
  place_name?: string;
  text?: string;
  center: [number, number];
}
