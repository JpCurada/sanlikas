export const HAZARD_TYPES = ['flood', 'landslide', 'fire', 'road_blocked', 'other'] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

export const HAZARD_LABELS: Record<HazardType, string> = {
  flood: 'Flood / Baha',
  landslide: 'Landslide',
  fire: 'Fire',
  road_blocked: 'Road blocked',
  other: 'Other',
};

export interface Report {
  id: string;
  authority_id: string;
  hazard_type: HazardType;
  description: string;
  severity: 1 | 2 | 3;
  lng: number;
  lat: number;
  hard_radius_m: number;
  soft_radius_m: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface AuthorityProfile {
  user_id: string;
  agency: string;
  full_name: string | null;
}

/** NCR camera bounds — kept in sync with the mobile app's lib/geo/ncr.ts. */
export const NCR_BOUNDS = {
  sw: [120.9, 14.3] as [number, number],
  ne: [121.15, 14.8] as [number, number],
  center: [121.025, 14.55] as [number, number],
};
