import type { Graph } from '@antv/g6';

/** Module-level singleton holding the active G6 Graph instance. */
let activeGraph: Graph | null = null;

export const graphRegistry = {
  set: (graph: Graph | null) => {
    activeGraph = graph;
  },
  get: (): Graph | null => activeGraph,
};
