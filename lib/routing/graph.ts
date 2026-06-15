import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import type { PedestrianGraph, RawGraph } from './types';

export { MAX_SNAP_METERS, snapToGraph, type SnapResult } from './snap';

let cached: PedestrianGraph | null = null;
let loading: Promise<PedestrianGraph> | null = null;

/**
 * Load the bundled NCR pedestrian graph and derive its adjacency list. Lazy and
 * memoized: the ~37 MB asset is only read/parsed when routing is first needed,
 * so it never blocks the map at launch. Subsequent calls return the cache.
 */
export function loadPedestrianGraph(): Promise<PedestrianGraph> {
  if (cached) return Promise.resolve(cached);
  if (loading) return loading;

  loading = (async () => {
    const asset = Asset.fromModule(require('@/assets/graph/ncr-pedestrian-graph.json'));
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('pedestrian graph asset has no readable URI');
    const raw = JSON.parse(await FileSystem.readAsStringAsync(uri)) as RawGraph;

    const adjacency: PedestrianGraph['adjacency'] = raw.nodes.map(() => []);
    for (const [a, b, meters, flood] of raw.edges) {
      adjacency[a].push([b, meters, flood]);
      adjacency[b].push([a, meters, flood]);
    }

    cached = {
      nodes: raw.nodes,
      adjacency,
      meta: {
        nodeCount: raw.meta.nodeCount,
        edgeCount: raw.meta.edgeCount,
        floodEdgeCount: raw.meta.floodEdgeCount,
        source: raw.meta.source,
      },
    };
    return cached;
  })();

  return loading;
}

/** Test-only: inject a graph so unit tests skip asset loading. */
export function __setGraphForTest(g: PedestrianGraph | null): void {
  cached = g;
  loading = null;
}
