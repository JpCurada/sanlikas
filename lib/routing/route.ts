import type { LngLat } from '@/lib/geo/ncr';
import { aStar, pathCoordinates } from './aStar';
import type { HazardContext } from './hazardCost';
import { snapToGraph } from './snap';
import type { PedestrianGraph, RoutePath } from './types';

const WALKING_MPS = 1.167; // 4.2 km/h, matches LIKAS

export class NoRouteError extends Error {
  constructor() {
    super('No walkable route found between those points.');
    this.name = 'NoRouteError';
  }
}

export class SnapFailedError extends Error {
  constructor(public readonly which: 'origin' | 'destination') {
    super(`${which} is too far from any walkable road.`);
    this.name = 'SnapFailedError';
  }
}

/**
 * Compute a hazard-aware walking route between two coordinates over an
 * already-loaded graph. Snaps both ends, runs hazard-aware A*, and assembles a
 * polyline that includes the real origin/destination as the first/last vertices
 * (so the line reaches the actual pin, not just the snapped road node).
 *
 * Pure (graph injected, no asset/native deps) so it is directly unit-testable.
 * The async, asset-loading wrapper lives in routeAsync.ts.
 */
export function computeRouteOnGraph(
  graph: PedestrianGraph,
  origin: LngLat,
  destination: LngLat,
  ctx: HazardContext,
): RoutePath {
  const start = snapToGraph(graph, origin);
  if (!start) throw new SnapFailedError('origin');
  const goal = snapToGraph(graph, destination);
  if (!goal) throw new SnapFailedError('destination');

  const result = aStar(graph, start.nodeId, goal.nodeId, ctx);
  if (!result) throw new NoRouteError();

  const coordinates: LngLat[] = [
    origin,
    ...pathCoordinates(graph, result.path),
    destination,
  ];
  const distanceMeters = result.distanceMeters + start.meters + goal.meters;

  return {
    coordinates,
    distanceMeters,
    durationMinutesWalking: Math.ceil(distanceMeters / WALKING_MPS / 60),
    compromised: result.crossedHazards.length > 0,
    crossedHazards: result.crossedHazards,
  };
}
