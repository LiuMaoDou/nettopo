import { useEffect, useRef } from 'react';
import type { IElementEvent } from '@antv/g6';
import { useGraph } from '../hooks/useGraph';
import { useTopoStore } from '../store/topoStore';

const CONTAINER_ID = 'topo-canvas';

/**
 * Main canvas component that hosts the G6 topology graph.
 *
 * Initialization order:
 *  1. `initGraph()` runs once on mount (no guard — safe to call twice in StrictMode
 *     because it destroys any previous instance before creating a new one).
 *  2. Data / layout / search effects check `graphRef.current` before acting.
 */
export default function TopologyCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { graphRef, initGraph, loadData, changeLayout, applySearch } = useGraph(CONTAINER_ID);
  const { topologyData, currentLayout, searchQuery, setSelectedNode } = useTopoStore();

  // Keep a stable ref to topologyData so event handlers always see the latest value
  const dataRef = useRef(topologyData);
  dataRef.current = topologyData;

  // ── Initialize graph on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const graph = initGraph();

    graph.on<IElementEvent>('node:click', (evt) => {
      const nodeId = (evt.target as { id?: string }).id;
      if (!nodeId || !dataRef.current) return;
      const node = dataRef.current.nodes.find((n) => n.id === nodeId) ?? null;
      setSelectedNode(node);
    });

    graph.on('canvas:click', () => {
      setSelectedNode(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // empty deps — run once; initGraph and setSelectedNode are stable callbacks

  // ── Load data whenever topology changes ────────────────────────────────────
  useEffect(() => {
    if (topologyData && graphRef.current) {
      loadData(topologyData);
    }
  }, [topologyData, loadData, graphRef]);

  // ── Switch layout ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (graphRef.current) {
      changeLayout(currentLayout);
    }
  }, [currentLayout, changeLayout, graphRef]);

  // ── Apply search highlight / dim ───────────────────────────────────────────
  useEffect(() => {
    if (graphRef.current) {
      applySearch(searchQuery, topologyData);
    }
  }, [searchQuery, topologyData, applySearch, graphRef]);

  return (
    <div
      id={CONTAINER_ID}
      ref={containerRef}
      className="w-full h-full bg-gray-950"
    />
  );
}
