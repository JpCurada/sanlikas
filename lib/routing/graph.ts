import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { getCachedGraph, setGraph } from './graphCache';
import type { PedestrianGraph, RawGraph } from './types';

export { MAX_SNAP_METERS, snapToGraph, type SnapResult } from './snap';
export { __setGraphForTest } from './graphCache';

let loading: Promise<PedestrianGraph> | null = null;

/**
 * Load the bundled NCR pedestrian graph and derive its adjacency list. Lazy and
 * memoized via graphCache: the ~37 MB asset is only read/parsed when routing is
 * first needed. This module imports expo-asset, so it must only be imported in
 * the React Native app — Node-side callers (CLI, tests) inject a graph via
 * graphCache and never import this file.
 */
export function loadPedestrianGraph(): Promise<PedestrianGraph> {
  const cached = getCachedGraph();
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

    const graph: PedestrianGraph = {
      nodes: raw.nodes,
      adjacency,
      meta: {
        nodeCount: raw.meta.nodeCount,
        edgeCount: raw.meta.edgeCount,
        floodEdgeCount: raw.meta.floodEdgeCount,
        source: raw.meta.source,
      },
    };
    setGraph(graph);
    return graph;
  })();

  return loading;
}

/**
 * App entry point: ensure the graph is in the cache before routing. Call once
 * before the agent runs (idempotent; subsequent calls return immediately).
 */
export async function ensureGraphLoaded(): Promise<void> {
  await loadPedestrianGraph();
}
