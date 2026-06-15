/**
 * NCR (Metro Manila) geographic constants — the ONLY place these live.
 * Never hardcode bounds/zoom elsewhere (skill/REACT-NATIVE-EXPO-DEV.md).
 */

/** [longitude, latitude] */
export type LngLat = [number, number];

/** Southwest corner of the NCR camera lock. */
export const NCR_SW: LngLat = [120.9, 14.3];

/** Northeast corner of the NCR camera lock. */
export const NCR_NE: LngLat = [121.15, 14.8];

/** Camera maxBounds payload for @rnmapbox/maps. */
export const NCR_MAX_BOUNDS = { sw: NCR_SW, ne: NCR_NE };

/** Center of the NCR extent — initial camera target. */
export const NCR_CENTER: LngLat = [
  (NCR_SW[0] + NCR_NE[0]) / 2,
  (NCR_SW[1] + NCR_NE[1]) / 2,
];

export const PH_SW: LngLat = [116.8, 4.4];
export const PH_NE: LngLat = [127.2, 21.3];
export const PH_MAX_BOUNDS = { sw: PH_SW, ne: PH_NE };
export const PH_CENTER: LngLat = [
  (PH_SW[0] + PH_NE[0]) / 2,
  (PH_SW[1] + PH_NE[1]) / 2,
];

export const NCR_MIN_ZOOM = 10;
export const NCR_MAX_ZOOM = 18;

/** Initial zoom: shows the full NCR extent (US-1.1). */
export const NCR_INITIAL_ZOOM = 10;

/** Default pitch for the 3D view. */
export const NCR_DEFAULT_PITCH = 50;

export function isInNcr([lng, lat]: LngLat): boolean {
  return lng >= NCR_SW[0] && lng <= NCR_NE[0] && lat >= NCR_SW[1] && lat <= NCR_NE[1];
}

export function isInPhilippines([lng, lat]: LngLat): boolean {
  return lng >= PH_SW[0] && lng <= PH_NE[0] && lat >= PH_SW[1] && lat <= PH_NE[1];
}

/**
 * Clamp a coordinate to the NCR bounds. Programmatic camera moves must clamp
 * their targets first — maxBounds and flyTo fight otherwise (playbook pitfall).
 */
export function clampToNcr([lng, lat]: LngLat): LngLat {
  return [
    Math.min(Math.max(lng, NCR_SW[0]), NCR_NE[0]),
    Math.min(Math.max(lat, NCR_SW[1]), NCR_NE[1]),
  ];
}

export function clampToPhilippines([lng, lat]: LngLat): LngLat {
  return [
    Math.min(Math.max(lng, PH_SW[0]), PH_NE[0]),
    Math.min(Math.max(lat, PH_SW[1]), PH_NE[1]),
  ];
}
