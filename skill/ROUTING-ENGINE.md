# Agent: Routing Engine Developer

You build the from-scratch hazard-aware A\* — **the project's core requirement: no
third-party routing API, ever.** Authority docs: [docs/design.md](../docs/design.md)
§5; [docs/user-stories.md](../docs/user-stories.md) US-3.4.

## Source material — adapt, don't reinvent

Port from the LIKAS project (proven on low-end Android):

- `likas/Likas/src/services/routingService.ts` → `lib/routing/aStar.ts` +
  `lib/routing/minHeap.ts` + `lib/routing/snap.ts`. Keep: binary MinHeap, haversine
  heuristic (admissible — do not "optimize" it into something inadmissible),
  `MAX_SNAP_METERS = 1500`, `WALKING_MPS = 1.167`, typed errors
  (`NoRouteError`, `RouteTooLongError`, `GraphNotLoadedError`).
- `likas/Likas/src/services/graphDb.ts` → `lib/routing/graphDb.ts`. Keep: singleton
  SQLite handle, corridor bbox subgraph (`CORRIDOR_PADDING = 0.4`,
  `MIN_PAD_DEG = 0.012`), `MAX_ROUTE_KM` cap (can drop to ~15 km for NCR-only).
  Swap `react-native-sqlite-storage` → `expo-sqlite` (Expo-compatible).
- `likas/scripts/generate-pedestrian-graph.mjs` → `scripts/build-pedestrian-graph.mjs`.
  Its `BBOX` is already Metro Manila. Change output from JSON to the SQLite DB
  (`pg_nodes`, `pg_edges` tables + indexes) bundled at `assets/graph/ncr-pedestrian-graph.db`.
  Source data: `data/maps/philippines-260611.osm.pbf` (local, fresh). Additionally
  intersect edges with `data/maps/MetroManila_Flood_100year.json` at build time →
  `flood_risk` column on `pg_edges` (build-time geometry, zero runtime cost).

## SanLikas's addition: hazard-aware edge cost (`lib/routing/hazardCost.ts`)

```
cost(edge) = edge.meters × multiplier
  hard-block buffer hit  → ∞ (skip edge)      e.g. flood sev-3 300 m, road_blocked 100 m
  soft-penalty buffer    → 10×                e.g. flood sev-1 150 m
  PAGASA advisory city   → 1.5× (never block a whole city)
  clean                  → 1×
  × static flood_risk:  ×3 when rain warning active, ×1.2 otherwise (design §5.2)
```

- Buffers are **circles** from active DRRM reports — test edge endpoints + midpoint
  with haversine point-in-circle. O(1) per edge, no geometry library.
- The multiplier function is injected into A\* as a parameter (pure core, hazards
  as input) — keeps the algorithm unit-testable without hazard state.
- Finite soft penalties ⇒ A\* still returns a least-bad path when everything is
  hazardous; flag the result `compromised: true` with intersected hazards listed.
  **Never return a compromised route unflagged.**

## Center selection (`lib/routing/centerSelection.ts`)

k=5 nearest facilities by haversine from bundled GeoJSON → hazard-aware A\* to
each → clean route to nearest wins → else nearest clean → else least-penalized
flagged compromised. Record the trade-off reason for the agent. Snap > 250 m ⇒
include `snap_distance`.

## Testing (this module gets the most tests in the repo)

- Fixture graph (~20 nodes, built in-test): assert known shortest path; assert
  detour when a hazard circle covers the direct edge; assert `compromised: true`
  when all paths blocked; assert `NoRouteError` on disconnected subgraph; assert
  snap refusal beyond 1500 m.
- A\* must run off the JS thread for big corridors? No — corridor subgraphs are
  small; but wrap `route()` in `InteractionManager.runAfterInteractions` and keep
  the LIKAS `AbortSignal` checks so a stale route request never overwrites a new one.
- Perf budget: route across QC→Manila (~8 km) in < 2 s on a mid-range Android device.
