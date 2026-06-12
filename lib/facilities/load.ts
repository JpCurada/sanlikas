import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import type { FacilityCollection, FacilityLayerState, FacilityType } from './types';

/**
 * Bundled, build-time-generated GeoJSON (scripts/build-facilities.ts).
 * Static require calls so Metro bundles every layer; never parse
 * data/evacuation/*.json at runtime (playbook rule).
 */
const FACILITY_ASSETS: Record<FacilityType, number> = {
  evacuation: require('@/assets/facilities/evacuation.geojson'),
  covered_court: require('@/assets/facilities/covered_court.geojson'),
  gymnasium: require('@/assets/facilities/gymnasium.geojson'),
  hospital: require('@/assets/facilities/hospital.geojson'),
  multi_purpose: require('@/assets/facilities/multi_purpose.geojson'),
  school: require('@/assets/facilities/school.geojson'),
};

/**
 * Load one facility layer. Failures are isolated per layer: an unreadable or
 * malformed asset yields status "error" for that layer only (US-2.1).
 */
export async function loadFacilityLayer(type: FacilityType): Promise<FacilityLayerState> {
  try {
    const asset = Asset.fromModule(FACILITY_ASSETS[type]);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('asset has no readable URI');
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as FacilityCollection;
    if (parsed?.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
      throw new Error('not a FeatureCollection');
    }
    return {
      status: parsed.features.length === 0 ? 'empty' : 'ready',
      collection: parsed,
    };
  } catch (err) {
    console.warn(`[facilities] layer "${type}" failed to load:`, err);
    return { status: 'error', collection: null };
  }
}

/** Load all layers in parallel; per-layer failures stay isolated. */
export async function loadAllFacilityLayers(
  types: readonly FacilityType[],
): Promise<Record<FacilityType, FacilityLayerState>> {
  const entries = await Promise.all(
    types.map(async (type) => [type, await loadFacilityLayer(type)] as const),
  );
  return Object.fromEntries(entries) as Record<FacilityType, FacilityLayerState>;
}
