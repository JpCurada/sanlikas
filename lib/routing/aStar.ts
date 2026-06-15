import type { LngLat } from '@/lib/geo/ncr';
import { haversineMeters } from './geo';
import { edgeCost, type HazardContext } from './hazardCost';
import { MinHeap } from './minHeap';
import type { HazardZone, PedestrianGraph } from './types';

export interface AStarResult {
  /** Ordered node indices from start to goal. */
  path: number[];
  /** True geographic distance along the path (meters), ignoring penalties. */
  distanceMeters: number;
  /** Sum of penalized edge costs — the value A* actually minimized. */
  penalizedCost: number;
  /** Soft-penalty hazards the chosen path passes through. */
  crossedHazards: HazardZone[];
}

/**
 * Hazard-aware A* over the pedestrian graph. Minimizes penalized cost
 * (distance × hazard multiplier; see hazardCost.ts). The haversine heuristic to
 * the goal is admissible against the penalized cost because every multiplier is
 * >= 1, so true geographic distance is a lower bound on remaining penalized cost.
 *
 * Hard-block edges (Infinity cost) are never expanded, so a returned path only
 * traverses soft-penalty hazards when no fully clean route exists — that is what
 * `crossedHazards` reports, and the caller flags as `compromised`.
 */
export function aStar(
  graph: PedestrianGraph,
  startId: number,
  goalId: number,
  ctx: HazardContext,
): AStarResult | null {
  const { nodes, adjacency } = graph;
  if (startId === goalId) {
    return { path: [startId], distanceMeters: 0, penalizedCost: 0, crossedHazards: [] };
  }

  const goalCoord = nodes[goalId];
  const heuristic = (id: number) => haversineMeters(nodes[id], goalCoord);

  const gScore = new Map<number, number>(); // penalized cost from start
  const realDist = new Map<number, number>(); // true meters from start
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();

  gScore.set(startId, 0);
  realDist.set(startId, 0);
  open.push({ id: startId, f: heuristic(startId) });

  while (open.size() > 0) {
    const current = open.pop()!;
    if (closed.has(current.id)) continue;
    if (current.id === goalId) return reconstruct(current.id);
    closed.add(current.id);

    const curG = gScore.get(current.id) ?? Infinity;
    const curD = realDist.get(current.id) ?? 0;
    const a = nodes[current.id];

    for (const [nbId, meters, floodRisk] of adjacency[current.id]) {
      if (closed.has(nbId)) continue;
      const { cost } = edgeCost(a, nodes[nbId], meters, floodRisk, ctx);
      if (!Number.isFinite(cost)) continue; // hard-blocked edge — never traverse

      const tentative = curG + cost;
      if (tentative < (gScore.get(nbId) ?? Infinity)) {
        cameFrom.set(nbId, current.id);
        gScore.set(nbId, tentative);
        realDist.set(nbId, curD + meters);
        open.push({ id: nbId, f: tentative + heuristic(nbId) });
      }
    }
  }
  return null;

  function reconstruct(endId: number): AStarResult {
    const path: number[] = [endId];
    let cur = endId;
    while (cameFrom.has(cur)) {
      cur = cameFrom.get(cur)!;
      path.push(cur);
    }
    path.reverse();

    // Identify soft-penalty hazards the final path touches.
    const crossed = new Map<string, HazardZone>();
    for (let i = 0; i + 1 < path.length; i++) {
      const { hazardsHit } = edgeCost(
        nodes[path[i]],
        nodes[path[i + 1]],
        0,
        0,
        ctx,
      );
      for (const hz of hazardsHit) crossed.set(hz.id, hz);
    }

    return {
      path,
      distanceMeters: realDist.get(endId) ?? 0,
      penalizedCost: gScore.get(endId) ?? 0,
      crossedHazards: [...crossed.values()],
    };
  }
}

/** Coordinates ([lon, lat]) for a path of node indices. */
export function pathCoordinates(graph: PedestrianGraph, path: number[]): LngLat[] {
  return path.map((id) => graph.nodes[id]);
}
