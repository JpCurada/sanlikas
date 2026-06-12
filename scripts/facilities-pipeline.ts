/**
 * Pure logic for the facility build pipeline (scripts/build-facilities.ts).
 * Kept free of fs/path so it is unit-testable under jest.
 *
 * Input: nationwide OSM Nominatim-style records from data/evacuation/*.json.
 * Output: one GeoJSON FeatureCollection per facility type, filtered to NCR,
 * deduplicated by OSM id across files, with malformed coordinates skipped.
 */

export const FACILITY_TYPES = [
  'evacuation',
  'covered_court',
  'gymnasium',
  'hospital',
  'multi_purpose',
  'school',
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number];

/** NCR bounding box fallback: [west, south, east, north]. */
export const NCR_BBOX = [120.9, 14.3, 121.15, 14.8] as const;

/** Raw OSM Nominatim-style record (only the fields we read). */
export interface OsmRecord {
  osm_type?: string;
  osm_id?: number | string;
  lat?: string | number;
  lon?: string | number;
  name?: string;
  display_name?: string;
  address?: {
    state?: string;
    region?: string;
    ['ISO3166-2-lvl3']?: string;
    ['ISO3166-2-lvl4']?: string;
    [key: string]: string | undefined;
  };
  extratags?: {
    ['capacity:persons']?: string;
    ['emergency:hazard_type']?: string;
    [key: string]: string | undefined;
  } | null;
}

export interface FacilityProperties {
  id: string;
  osmId: number | string;
  facilityType: FacilityType;
  name: string | null;
  address: string | null;
  capacity: string | null;
  hazardTypes: string[] | null;
}

export type FacilityFeature = GeoJSON.Feature<GeoJSON.Point, FacilityProperties>;
export type FacilityCollection = GeoJSON.FeatureCollection<GeoJSON.Point, FacilityProperties>;

export interface PipelineWarnings {
  malformedCoordinates: string[];
  duplicatesDropped: string[];
}

/** Parse lat/lon (strings in the source data) into [lon, lat]; null if malformed. */
export function parseCoordinates(record: OsmRecord): [number, number] | null {
  const lat = typeof record.lat === 'number' ? record.lat : parseFloat(String(record.lat ?? ''));
  const lon = typeof record.lon === 'number' ? record.lon : parseFloat(String(record.lon ?? ''));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lon, lat];
}

function isInBbox([lon, lat]: [number, number]): boolean {
  const [west, south, east, north] = NCR_BBOX;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/**
 * NCR membership test.
 *
 * Primary signal: the address block. Records labeled "Metro Manila"
 * (region/state) or ISO3166-2 "PH-00" are NCR. Records explicitly labeled
 * with another region/state are NOT — even if their coordinates fall inside
 * the NCR bounding box (the box clips into Cavite/Laguna/Rizal).
 *
 * Fallback: only when the address carries no regional signal at all do we
 * fall back to the bounding-box test on the coordinates.
 */
export function isNcrRecord(record: OsmRecord, coords: [number, number]): boolean {
  const addr = record.address;
  const region = addr?.region?.trim();
  const state = addr?.state?.trim();
  const iso3 = addr?.['ISO3166-2-lvl3']?.trim();
  const iso4 = addr?.['ISO3166-2-lvl4']?.trim();

  const hasRegionalSignal = Boolean(region || state || iso3 || iso4);
  if (hasRegionalSignal) {
    return (
      region === 'Metro Manila' ||
      state === 'Metro Manila' ||
      iso3 === 'PH-00' ||
      iso4 === 'PH-00'
    );
  }
  return isInBbox(coords);
}

function parseHazardTypes(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const parts = raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

export function toFeature(record: OsmRecord, type: FacilityType, coords: [number, number]): FacilityFeature {
  const extratags = record.extratags ?? undefined;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: {
      id: `${record.osm_type ?? 'unknown'}/${record.osm_id ?? 'unknown'}`,
      osmId: record.osm_id ?? 'unknown',
      facilityType: type,
      name: record.name?.trim() || null,
      address: record.display_name?.trim() || null,
      capacity: extratags?.['capacity:persons']?.trim() || null,
      hazardTypes: parseHazardTypes(extratags?.['emergency:hazard_type']),
    },
  };
}

/**
 * Build one FeatureCollection per facility type from the raw records.
 *
 * - Filters to NCR (see isNcrRecord).
 * - Skips records with missing/malformed coordinates (collected in warnings).
 * - Dedupes by OSM id across files: the first file (in FACILITY_TYPES order)
 *   to claim an id keeps it; later occurrences are dropped and logged. We key
 *   on osm_type + osm_id since OSM node/way id spaces overlap.
 */
export function buildFacilityCollections(
  rawByType: Partial<Record<FacilityType, OsmRecord[]>>,
): { collections: Record<FacilityType, FacilityCollection>; warnings: PipelineWarnings } {
  const warnings: PipelineWarnings = { malformedCoordinates: [], duplicatesDropped: [] };
  const seen = new Set<string>();
  const collections = {} as Record<FacilityType, FacilityCollection>;

  for (const type of FACILITY_TYPES) {
    const features: FacilityFeature[] = [];
    for (const record of rawByType[type] ?? []) {
      const label = `${type}: ${record.osm_type ?? '?'}/${record.osm_id ?? '?'} ${record.name ?? '(unnamed)'}`;
      const coords = parseCoordinates(record);
      if (!coords) {
        warnings.malformedCoordinates.push(label);
        continue;
      }
      if (!isNcrRecord(record, coords)) continue;
      const key = `${record.osm_type ?? 'unknown'}/${record.osm_id ?? 'unknown'}`;
      if (seen.has(key)) {
        warnings.duplicatesDropped.push(label);
        continue;
      }
      seen.add(key);
      features.push(toFeature(record, type, coords));
    }
    collections[type] = { type: 'FeatureCollection', features };
  }

  return { collections, warnings };
}
