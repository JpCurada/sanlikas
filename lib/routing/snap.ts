import type { LngLat } from '@/lib/geo/ncr';
import { haversineMeters } from './geo';
import type { PedestrianGraph } from './types';

/** Refuse to snap to the graph beyond this — matches LIKAS MAX_SNAP_METERS. */
export const MAX_SNAP_METERS = 1500;

export interface SnapResult {
  nodeId: number;
  meters: number;
}

/**
 * Nearest graph node to a coordinate via linear scan. The full NCR graph is
 * ~777k nodes, so a scan is ~a few ms — acceptable, and avoids shipping a
 * spatial index. Returns null if the nearest node is beyond MAX_SNAP_METERS.
 *
 * Pure (no asset/native deps) so the routing core stays unit-testable.
 */
export function snapToGraph(graph: PedestrianGraph, point: LngLat): SnapResult | null {
  let bestId = -1;
  let bestM = Infinity;
  const { nodes } = graph;
  for (let i = 0; i < nodes.length; i++) {
    const m = haversineMeters(point, nodes[i]);
    if (m < bestM) {
      bestM = m;
      bestId = i;
    }
  }
  if (bestId === -1 || bestM > MAX_SNAP_METERS) return null;
  return { nodeId: bestId, meters: bestM };
}
