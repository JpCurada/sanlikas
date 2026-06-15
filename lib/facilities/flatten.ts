import type { Feature, Point } from 'geojson';
import type { FacilityLayerState, FacilityProperties, FacilityType } from './types';

/**
 * Flatten loaded facility layers into a single feature list for the router /
 * agent. Evacuation centers and other shelter types are all valid destinations;
 * hospitals are included (they shelter too). Skips layers that failed to load.
 */
export function flattenFacilities(
  layers: Record<FacilityType, FacilityLayerState>,
): Feature<Point, FacilityProperties>[] {
  const out: Feature<Point, FacilityProperties>[] = [];
  for (const state of Object.values(layers)) {
    if (state.status !== 'ready' || !state.collection) continue;
    out.push(...state.collection.features);
  }
  return out;
}
