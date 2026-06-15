import type { PedestrianGraph } from './types';

/**
 * Pure graph cache + injection point. No expo/react-native imports, so it is
 * safe to import in plain Node (the agent CLI, unit tests). The RN asset loader
 * lives in graph.ts and writes here via setGraph().
 *
 * State is stored on globalThis so it survives module duplication — under tsx
 * the `@/` alias and relative paths can resolve to separate module instances,
 * and a plain module-level variable would not be shared between them.
 */
const KEY = '__sanlikas_pedestrian_graph__';

interface GraphHolder {
  [KEY]?: PedestrianGraph | null;
}

export function getCachedGraph(): PedestrianGraph | null {
  return (globalThis as GraphHolder)[KEY] ?? null;
}

export function setGraph(g: PedestrianGraph | null): void {
  (globalThis as GraphHolder)[KEY] = g;
}

/** Test/CLI helper alias — inject a graph so the RN asset loader is never hit. */
export function __setGraphForTest(g: PedestrianGraph | null): void {
  setGraph(g);
}
