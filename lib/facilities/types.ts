import type { FeatureCollection, Point } from 'geojson';

export const FACILITY_TYPES = [
  'evacuation',
  'covered_court',
  'gymnasium',
  'hospital',
  'multi_purpose',
  'school',
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number];

/** Properties emitted by scripts/build-facilities.ts for every feature. */
export interface FacilityProperties {
  id: string;
  osmId: number | string;
  facilityType: FacilityType;
  name: string | null;
  address: string | null;
  capacity: string | null;
  hazardTypes: string[] | null;
}

export type FacilityCollection = FeatureCollection<Point, FacilityProperties>;

export interface FacilityTypeMeta {
  type: FacilityType;
  label: string;
  /** Marker/legend color — distinct per type (US-2.1). */
  color: string;
}

export const FACILITY_META: Record<FacilityType, FacilityTypeMeta> = {
  evacuation: { type: 'evacuation', label: 'Evacuation centers', color: '#E4572E' },
  covered_court: { type: 'covered_court', label: 'Covered courts', color: '#F3A712' },
  gymnasium: { type: 'gymnasium', label: 'Gymnasiums', color: '#A23B72' },
  hospital: { type: 'hospital', label: 'Hospitals', color: '#D7263D' },
  multi_purpose: { type: 'multi_purpose', label: 'Multi-purpose halls', color: '#2E86AB' },
  school: { type: 'school', label: 'Schools', color: '#1B998B' },
};

/** Load status per layer — one bad file never blanks the map (US-2.1). */
export type FacilityLayerStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface FacilityLayerState {
  status: FacilityLayerStatus;
  collection: FacilityCollection | null;
}
