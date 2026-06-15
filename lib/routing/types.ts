import type { LngLat } from '@/lib/geo/ncr';

/**
 * Runtime pedestrian graph (built by scripts/build-pedestrian-graph.mjs).
 * Compact, index-based: node `i` has coordinate `nodes[i]`; edges reference
 * node indices. `adjacency` is derived once on load.
 */
export interface PedestrianGraph {
  nodes: LngLat[]; // [lon, lat] per node index
  /** node index → [neighborIndex, meters, floodRisk(0|1)][] */
  adjacency: Array<Array<[number, number, number]>>;
  meta: {
    nodeCount: number;
    edgeCount: number;
    floodEdgeCount: number;
    source: string;
  };
}

/** Raw on-disk shape (pre-adjacency); see build-pedestrian-graph.mjs. */
export interface RawGraph {
  meta: PedestrianGraph['meta'] & { builtAt: string; bbox: unknown };
  nodes: [number, number][];
  edges: [number, number, number, number][]; // [a, b, meters, floodRisk]
}

/** A reported hazard, as the router consumes it. Circle buffer by construction. */
export interface HazardZone {
  id: string;
  kind: 'flood' | 'landslide' | 'fire' | 'road_blocked' | 'other';
  center: LngLat; // [lon, lat]
  /** Hard-block radius in meters (edges inside are impassable). */
  hardRadiusM: number;
  /** Soft-penalty radius in meters (edges inside cost 10×). >= hardRadiusM. */
  softRadiusM: number;
  severity: 1 | 2 | 3;
  description: string;
}

/** Result of a single A* route between two graph nodes. */
export interface RoutePath {
  /** Polyline as [lon, lat] coordinates including snap endpoints. */
  coordinates: LngLat[];
  distanceMeters: number;
  durationMinutesWalking: number;
  /** True if the path could only be found by crossing a hazard. */
  compromised: boolean;
  /** Hazard zones the path passes through (empty if clean). */
  crossedHazards: HazardZone[];
}
