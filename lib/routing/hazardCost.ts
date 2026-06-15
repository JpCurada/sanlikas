import type { LngLat } from '@/lib/geo/ncr';
import { pointToSegmentMeters } from './geo';
import type { HazardZone } from './types';

/**
 * Hazard-aware edge multipliers (design §5.2). Distance is multiplied by these;
 * Infinity removes the edge from A* expansion entirely.
 */
export const HARD_BLOCK = Infinity;
export const SOFT_PENALTY = 10;
/**
 * Static penalty for roads in 100-year flood-susceptibility zones (real terrain
 * data). A mild, weather-independent preference to route out of flood-prone
 * areas when a clean detour is cheap. (No live weather feed is used.)
 */
export const FLOOD_PRONE = 1.4;
export const CLEAN = 1;

export interface HazardContext {
  hazards: HazardZone[];
}

export interface EdgeCost {
  /** Distance × multiplier. Infinity ⇒ impassable. */
  cost: number;
  /** Hazards whose buffer this edge intersects (for compromised reporting). */
  hazardsHit: HazardZone[];
}

/**
 * Cost of traversing an edge from `a` to `b` (both [lon, lat]) of length
 * `meters`, given the static `floodRisk` flag and the live hazard context.
 *
 * Pure: no graph/app state. The A* core calls this per edge; unit tests call
 * it directly. Returns the worst applicable hazard multiplier (a hard block
 * dominates everything) times the static flood factor.
 */
export function edgeCost(
  a: LngLat,
  b: LngLat,
  meters: number,
  floodRisk: number,
  ctx: HazardContext,
): EdgeCost {
  let multiplier = CLEAN;
  const hazardsHit: HazardZone[] = [];

  for (const hz of ctx.hazards) {
    const dist = pointToSegmentMeters(hz.center, a, b);
    if (dist <= hz.hardRadiusM) {
      hazardsHit.push(hz);
      // Hard block dominates; short-circuit.
      return { cost: HARD_BLOCK, hazardsHit };
    }
    if (dist <= hz.softRadiusM) {
      hazardsHit.push(hz);
      multiplier = Math.max(multiplier, SOFT_PENALTY);
    }
  }

  if (floodRisk) {
    multiplier *= FLOOD_PRONE;
  }

  return { cost: meters * multiplier, hazardsHit };
}
