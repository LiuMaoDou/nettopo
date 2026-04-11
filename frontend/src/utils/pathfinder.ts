import type { TopoNode, TopoEdge } from '../types/topo';

/**
 * Find the shortest path (by hop count) between two nodes using BFS.
 * Returns an ordered array of node IDs, or null if unreachable.
 */
export function findShortestPath(
  nodes: TopoNode[],
  edges: TopoEdge[],
  sourceId: string,
  targetId: string
): string[] | null {
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return null;
  if (sourceId === targetId) return [sourceId];

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue = [sourceId];
  visited.add(sourceId);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === targetId) {
      // Reconstruct path
      const path: string[] = [];
      let node: string | undefined = targetId;
      while (node !== undefined) {
        path.unshift(node);
        node = parent.get(node);
      }
      return path;
    }
    for (const neighbor of adj.get(curr) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, curr);
        queue.push(neighbor);
      }
    }
  }
  return null;
}
