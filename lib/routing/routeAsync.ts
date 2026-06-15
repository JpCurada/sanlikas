import type { Feature, Point } from 'geojson';
import type { LngLat } from '@/lib/geo/ncr';
import type { FacilityProperties } from '@/lib/facilities/types';
import { findSafestCenterOnGraph, type SafestCenterResult } from './centerSelection';
import { loadPedestrianGraph } from './graph';
import type { HazardContext } from './hazardCost';
import { computeRouteOnGraph } from './route';
import type { RoutePath } from './types';

/** Asset-loading wrappers around the pure routing core (route.ts / centerSelection.ts). */

export async function computeRoute(
  origin: LngLat,
  destination: LngLat,
  ctx: HazardContext,
): Promise<RoutePath> {
  const graph = await loadPedestrianGraph();
  return computeRouteOnGraph(graph, origin, destination, ctx);
}

export async function findSafestCenter(
  origin: LngLat,
  facilities: Feature<Point, FacilityProperties>[],
  ctx: HazardContext,
  k?: number,
): Promise<SafestCenterResult> {
  const graph = await loadPedestrianGraph();
  return findSafestCenterOnGraph(graph, origin, facilities, ctx, k);
}
