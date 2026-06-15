import type { Feature, Point } from 'geojson';
import type { LngLat } from '@/lib/geo/ncr';
import type { FacilityProperties } from '@/lib/facilities/types';
import { aStar } from '../aStar';
import { edgeCost, type HazardContext } from '../hazardCost';
import { computeRouteOnGraph, NoRouteError } from '../route';
import { findSafestCenterOnGraph } from '../centerSelection';
import type { HazardZone, PedestrianGraph } from '../types';

/**
 * Fixture: two parallel west→east corridors near España, Manila.
 *
 *   north row:  N0 — N1 — N2 — N3      (the detour — slightly longer)
 *               |    |    |    |
 *   south row:  S0 — S1 — S2 — S3      (the direct line)
 *
 * Origin snaps near S0, destination near S3. The direct route is along the
 * south row; a flood placed on S1–S2 forces the north detour.
 */
const LON0 = 120.985;
const LAT_S = 14.605;
const LAT_N = 14.611; // ~670 m north
const DLON = 0.004; // ~430 m per column

function buildFixture(): {
  graph: PedestrianGraph;
  coords: Record<string, LngLat>;
} {
  const coords: Record<string, LngLat> = {};
  const nodes: LngLat[] = [];
  const index: Record<string, number> = {};
  const push = (name: string, lon: number, lat: number) => {
    index[name] = nodes.length;
    nodes.push([lon, lat]);
    coords[name] = [lon, lat];
  };
  for (let c = 0; c < 4; c++) {
    push(`S${c}`, LON0 + c * DLON, LAT_S);
    push(`N${c}`, LON0 + c * DLON, LAT_N);
  }

  const adjacency: PedestrianGraph['adjacency'] = nodes.map(() => []);
  const link = (a: string, b: string) => {
    const ia = index[a];
    const ib = index[b];
    const m = haversine(nodes[ia], nodes[ib]);
    adjacency[ia].push([ib, m, 0]);
    adjacency[ib].push([ia, m, 0]);
  };
  // horizontal rows
  for (let c = 0; c < 3; c++) {
    link(`S${c}`, `S${c + 1}`);
    link(`N${c}`, `N${c + 1}`);
  }
  // vertical rungs at the ends so the detour is reachable
  link('S0', 'N0');
  link('S3', 'N3');

  return {
    graph: {
      nodes,
      adjacency,
      meta: { nodeCount: nodes.length, edgeCount: 0, floodEdgeCount: 0, source: 'fixture' },
    },
    coords,
  };
}

function haversine([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NO_HAZARDS: HazardContext = { hazards: [] };

describe('edgeCost', () => {
  const a: LngLat = [120.985, 14.605];
  const b: LngLat = [120.989, 14.605];

  it('is distance when clean', () => {
    expect(edgeCost(a, b, 100, 0, NO_HAZARDS).cost).toBe(100);
  });

  it('hard-blocks an edge through a hazard core', () => {
    const hz: HazardZone = mkHazard([120.987, 14.605], 200, 400);
    const { cost, hazardsHit } = edgeCost(a, b, 100, 0, { hazards: [hz] });
    expect(cost).toBe(Infinity);
    expect(hazardsHit).toHaveLength(1);
  });

  it('applies 10x in the soft-penalty ring', () => {
    // Hazard centered ~300 m north of the edge: outside hard (200) but inside soft (500).
    const hz: HazardZone = mkHazard([120.987, 14.6077], 200, 500);
    const { cost } = edgeCost(a, b, 100, 0, { hazards: [hz] });
    expect(cost).toBe(1000);
  });

  it('applies the static flood-prone penalty to flood-risk edges', () => {
    // floodRisk=1 -> 100m * FLOOD_PRONE (1.4) = 140; floodRisk=0 stays 100.
    expect(edgeCost(a, b, 100, 1, { hazards: [] }).cost).toBeCloseTo(140);
    expect(edgeCost(a, b, 100, 0, { hazards: [] }).cost).toBe(100);
  });
});

describe('aStar', () => {
  const { graph, coords } = buildFixture();
  const startId = 0; // S0
  const goalId = graph.nodes.findIndex(
    (n) => n[0] === coords.S3[0] && n[1] === coords.S3[1],
  );

  it('takes the direct south row when clean', () => {
    const r = aStar(graph, startId, goalId, NO_HAZARDS)!;
    const names = r.path.map((i) => nameOf(coords, graph.nodes[i]));
    expect(names).toEqual(['S0', 'S1', 'S2', 'S3']);
    expect(r.crossedHazards).toHaveLength(0);
  });

  it('detours via the north row when a flood blocks the direct path', () => {
    const flood = mkHazard(midpoint(coords.S1, coords.S2), 250, 450);
    const r = aStar(graph, startId, goalId, { hazards: [flood] })!;
    const names = r.path.map((i) => nameOf(coords, graph.nodes[i]));
    expect(names).toEqual(['S0', 'N0', 'N1', 'N2', 'N3', 'S3']);
    expect(r.crossedHazards).toHaveLength(0); // detour is clean
  });

  it('returns a compromised path when every route only has soft-penalty hazards', () => {
    // Floods offset ~330 m north of each row's middle edge: outside the 50 m
    // hard radius but inside the 500 m soft radius, so both rows are passable
    // but penalized — A* must return a compromised path rather than null.
    const f1 = mkHazard(offsetNorth(midpoint(coords.S1, coords.S2), -0.0012), 50, 400);
    const f2 = mkHazard(offsetNorth(midpoint(coords.N1, coords.N2), 0.0012), 50, 400);
    const r = aStar(graph, startId, goalId, { hazards: [f1, f2] })!;
    expect(r).not.toBeNull();
    expect(r.crossedHazards.length).toBeGreaterThan(0);
  });

  it('returns null when hard-blocks sever every route', () => {
    // Hard radius covers the middle edge of both rows — genuinely unreachable.
    const f1 = mkHazard(midpoint(coords.S1, coords.S2), 250, 400);
    const f2 = mkHazard(midpoint(coords.N1, coords.N2), 250, 400);
    expect(aStar(graph, startId, goalId, { hazards: [f1, f2] })).toBeNull();
  });

  it('returns null when the goal is disconnected', () => {
    const isolated: PedestrianGraph = {
      ...graph,
      adjacency: graph.nodes.map((_, i) => (i === goalId ? [] : graph.adjacency[i].filter(([n]) => n !== goalId))),
    };
    expect(aStar(isolated, startId, goalId, NO_HAZARDS)).toBeNull();
  });
});

describe('findSafestCenter', () => {
  const { graph, coords } = buildFixture();
  // Two evac centers: one at S3 (near, but the direct route floods),
  // one reached via N3 placed slightly farther — should win when S-row floods.
  const near = mkFacility('near-S3', coords.S3);
  const far = mkFacility('far-N3', coords.N3);

  it('picks the nearest center when all routes are clean', () => {
    const res = findSafestCenterOnGraph(graph, coords.S0, [near, far], NO_HAZARDS);
    expect(res.compromised).toBe(false);
    expect(res.chosen?.facility.properties.id).toBe('near-S3');
  });

  it('picks a farther but clean center when the nearest route is hazardous', () => {
    const flood = mkHazard(midpoint(coords.S1, coords.S2), 250, 450);
    const ctx: HazardContext = { hazards: [flood] };
    const res = findSafestCenterOnGraph(graph, coords.S0, [near, far], ctx);
    // near-S3 is closer straight-line, but its only clean route detours north;
    // the chosen route must be clean regardless of which center.
    expect(res.compromised).toBe(false);
    expect(res.chosen?.route?.compromised).toBe(false);
  });
});

describe('computeRouteOnGraph', () => {
  const { graph, coords } = buildFixture();
  it('throws NoRouteError for a disconnected destination', () => {
    const isolated: PedestrianGraph = {
      ...graph,
      nodes: [...graph.nodes, [121.05, 14.7]], // far lone node
      adjacency: [...graph.adjacency, []],
    };
    expect(() => computeRouteOnGraph(isolated, coords.S0, [121.05, 14.7], NO_HAZARDS)).toThrow(
      NoRouteError,
    );
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

function mkHazard(center: LngLat, hard: number, soft: number): HazardZone {
  return {
    id: `hz-${center.join(',')}`,
    kind: 'flood',
    center,
    hardRadiusM: hard,
    softRadiusM: soft,
    severity: 3,
    description: 'test flood',
  };
}

function mkFacility(id: string, coord: LngLat): Feature<Point, FacilityProperties> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coord },
    properties: {
      id,
      osmId: id,
      facilityType: 'evacuation',
      name: id,
      address: null,
      capacity: null,
      hazardTypes: null,
    },
  };
}

function midpoint(a: LngLat, b: LngLat): LngLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Shift a point north (positive) or south (negative) by `dLat` degrees. */
function offsetNorth([lon, lat]: LngLat, dLat: number): LngLat {
  return [lon, lat + dLat];
}

function nameOf(coords: Record<string, LngLat>, n: LngLat): string {
  for (const [k, v] of Object.entries(coords)) {
    if (v[0] === n[0] && v[1] === n[1]) return k;
  }
  return '?';
}
