import type { Feature, Point } from 'geojson';
import type { LngLat } from '@/lib/geo/ncr';
import type { FacilityProperties } from '@/lib/facilities/types';
import { findSafestCenterOnGraph, type SafestCenterResult } from './centerSelection';
import { getCachedGraph } from './graphCache';
import type { HazardContext } from './hazardCost';
import { computeRouteOnGraph } from './route';
import type { PedestrianGraph, RoutePath } from './types';

/**
 * Routing wrappers over the pure core. These read the graph from graphCache and
 * do NOT import the bundled-asset loader (graph.ts, which pulls in expo-asset) —
 * keeping this module importable in plain Node (the agent CLI, tests).
 *
 * The graph must be loaded into the cache before calling these:
 *  - App:   ensureGraphLoaded() (graphLoader.ts) on first routing need.
 *  - CLI/tests: __setGraphForTest() injects it directly.
 */
function requireGraph(): PedestrianGraph {
  const g = getCachedGraph();
  if (!g) {
    throw new Error(
      'Pedestrian graph not loaded. Call ensureGraphLoaded() (app) or inject via __setGraphForTest (tests).',
    );
  }
  return g;
}

export function computeRoute(
  origin: LngLat,
  destination: LngLat,
  ctx: HazardContext,
): Promise<RoutePath> {
  return Promise.resolve(computeRouteOnGraph(requireGraph(), origin, destination, ctx));
}

export function findSafestCenter(
  origin: LngLat,
  facilities: Feature<Point, FacilityProperties>[],
  ctx: HazardContext,
  k?: number,
): Promise<SafestCenterResult> {
  return Promise.resolve(findSafestCenterOnGraph(requireGraph(), origin, facilities, ctx, k));
}
