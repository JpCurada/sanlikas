import type { Feature, Point } from 'geojson';
import type { LngLat } from '@/lib/geo/ncr';
import type { FacilityProperties } from '@/lib/facilities/types';
import { haversineMeters } from './geo';
import type { HazardContext } from './hazardCost';
import { computeRouteOnGraph, NoRouteError, SnapFailedError } from './route';
import type { PedestrianGraph, RoutePath } from './types';

export interface Candidate {
  facility: Feature<Point, FacilityProperties>;
  straightLineMeters: number;
  route: RoutePath | null;
  /** Why this candidate was or wasn't chosen (for the agent to explain). */
  note: string;
}

export interface SafestCenterResult {
  chosen: Candidate | null;
  /** All candidates considered, nearest-first, with their route outcomes. */
  candidates: Candidate[];
  /** True when the chosen route still crosses a hazard (no clean option). */
  compromised: boolean;
}

const DEFAULT_K = 5;

/**
 * Pick the safest reachable evacuation center, not merely the nearest
 * (US-3.4 / demo scenario).
 *
 * Strategy:
 *  1. k-nearest facilities by straight-line distance.
 *  2. Hazard-aware A* to each.
 *  3. Prefer the nearest candidate with a fully CLEAN route; if none is clean,
 *     fall back to the least-bad (shortest penalized) compromised route and flag it.
 */
export function findSafestCenterOnGraph(
  graph: PedestrianGraph,
  origin: LngLat,
  facilities: Feature<Point, FacilityProperties>[],
  ctx: HazardContext,
  k: number = DEFAULT_K,
): SafestCenterResult {
  const nearest = [...facilities]
    .map((facility) => ({
      facility,
      straightLineMeters: haversineMeters(
        origin,
        facility.geometry.coordinates as LngLat,
      ),
    }))
    .sort((a, b) => a.straightLineMeters - b.straightLineMeters)
    .slice(0, k);

  const candidates: Candidate[] = nearest.map(({ facility, straightLineMeters }) => {
    try {
      const route = computeRouteOnGraph(
        graph,
        origin,
        facility.geometry.coordinates as LngLat,
        ctx,
      );
      return {
        facility,
        straightLineMeters,
        route,
        note: route.compromised
          ? `Route crosses ${describeHazards(route)}.`
          : 'Clean route — no reported hazards on the way.',
      };
    } catch (err) {
      const reason =
        err instanceof SnapFailedError
          ? `${err.which} could not be matched to a road`
          : err instanceof NoRouteError
            ? 'no walkable path exists'
            : 'routing failed';
      return { facility, straightLineMeters, route: null, note: `Unreachable — ${reason}.` };
    }
  });

  const clean = candidates
    .filter((c) => c.route && !c.route.compromised)
    .sort((a, b) => a.route!.distanceMeters - b.route!.distanceMeters);

  if (clean.length > 0) {
    return { chosen: clean[0], candidates, compromised: false };
  }

  // No clean option — choose the least-penalized compromised route.
  const compromised = candidates
    .filter((c) => c.route)
    .sort((a, b) => routePenalty(a.route!) - routePenalty(b.route!));

  return {
    chosen: compromised[0] ?? null,
    candidates,
    compromised: compromised.length > 0,
  };
}

function routePenalty(r: RoutePath): number {
  // Compromised routes ranked by distance; a crossed hazard adds a large tiebreak
  // so a shorter clean-ish detour still beats a longer one through more hazards.
  return r.distanceMeters + r.crossedHazards.length * 5000;
}

function describeHazards(route: RoutePath): string {
  const kinds = [...new Set(route.crossedHazards.map((h) => h.kind))];
  return kinds.join(', ') || 'a reported hazard';
}
