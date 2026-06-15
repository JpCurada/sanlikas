import type { LngLat } from '@/lib/geo/ncr';
import { pointToSegmentMeters } from './geo';
import type { HazardZone } from './types';

/**
 * Hazard-aware edge multipliers (design §5.2). Distance is multiplied by these;
 * Infinity removes the edge from A* expansion entirely.
 */
export const HARD_BLOCK = Infinity;
export const SOFT_PENALTY = 10;
export const FLOOD_ACTIVE = 3; // flood-prone edge while a rain warning is active
export const FLOOD_LATENT = 1.2; // flood-prone edge in calm weather
export const CLEAN = 1;

export interface HazardContext {
  hazards: HazardZone[];
  /** PAGASA Heavy Rainfall Warning active for NCR — raises flood-edge penalty. */
  rainWarningActive: boolean;
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
    multiplier *= ctx.rainWarningActive ? FLOOD_ACTIVE : FLOOD_LATENT;
  }

  return { cost: meters * multiplier, hazardsHit };
}
