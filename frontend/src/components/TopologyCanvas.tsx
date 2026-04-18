import { useEffect, useRef, useState, useCallback } from 'react';
import { Graph } from '@antv/g6';
import type { IElementEvent } from '@antv/g6';
import { useGraph, WEBGL_NODE_THRESHOLD } from '../hooks/useGraph';
import type { EdgeCostEntry } from '../hooks/useGraph';
import { useTopoStore } from '../store/topoStore';
import type { ProtocolConfig } from '../types/topo';

const CONTAINER_ID = 'topo-canvas';

/**
 * Build an edgeId → { src, dst } cost map from the active protocol config.
 * OSPF srcCost/dstCost takes priority; IS-IS srcMetric/dstMetric fills the rest.
 */
function buildCostMap(config: ProtocolConfig | null): Map<string, EdgeCostEntry> {
  const map = new Map<string, EdgeCostEntry>();
  if (!config) return map;
  config.ospf?.interfaces.forEach((iface) => {
    map.set(iface.edgeId, { src: iface.srcCost, dst: iface.dstCost });
  });
  config.isis?.interfaces.forEach((iface) => {
    if (!map.has(iface.edgeId))
      map.set(iface.edgeId, { src: iface.srcMetric, dst: iface.dstMetric });
  });
  return map;
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeName: string;
}

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
  const { graphRef, rendererTypeRef, initGraph, loadData, changeLayout, applySearch, setPortLabelsVisible, applyCostLabels, highlightRoutingResult, setRoutePickMarkers } = useGraph(CONTAINER_ID);
  const { topologyData, currentLayout, searchQuery, showPortLabels, showCostLabels, protocolConfig, setSelectedNode, routingResult, routingP2PHighlight, routePickSource, routePickDest, setRoutePickSource, setRoutePickDest } = useTopoStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Keep a stable ref to topologyData so event handlers always see the latest value
  const dataRef = useRef(topologyData);
  dataRef.current = topologyData;

  // Track mouse position for context menu placement (avoids depending on G6 event coords)
  const mousePosRef = useRef({ x: 0, y: 0 });

  // Close context menu on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Attaches G6 event listeners to a graph instance — called on mount and after renderer switch
  const setupListeners = useCallback((graph: Graph) => {
    graph.on<IElementEvent>('node:click', (evt) => {
      const nodeId = (evt.target as { id?: string }).id;
      if (!nodeId || !dataRef.current) return;
      const node = dataRef.current.nodes.find((n) => n.id === nodeId) ?? null;
      setSelectedNode(node);
      setContextMenu(null);
    });

    graph.on<IElementEvent>('node:contextmenu', (evt) => {
      const nodeId = (evt.target as { id?: string }).id;
      if (!nodeId || !dataRef.current) return;
      const node = dataRef.current.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setContextMenu({ x: mousePosRef.current.x, y: mousePosRef.current.y, nodeName: node.nodeName });
    });

    graph.on('canvas:click', () => {
      setSelectedNode(null);
      setContextMenu(null);
    });

    graph.on('canvas:contextmenu', () => {
      setContextMenu(null);
    });
  }, [setSelectedNode, setRoutePickSource, setRoutePickDest]);

  // ── Initialize graph on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const graph = initGraph('canvas');
    setupListeners(graph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // empty deps — run once; initGraph and setupListeners are stable callbacks

  // ── Load data whenever topology changes (auto-switch renderer if needed) ───
  useEffect(() => {
    if (!topologyData || !graphRef.current) return;

    const nodeCount = topologyData.nodes.length;
    const needed: 'canvas' | 'webgl' = nodeCount >= WEBGL_NODE_THRESHOLD ? 'webgl' : 'canvas';

    if (needed !== rendererTypeRef.current) {
      const graph = initGraph(needed);
      setupListeners(graph);
    }

    loadData(topologyData);
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

  // ── Toggle port label visibility ───────────────────────────────────────────
  useEffect(() => {
    if (graphRef.current) {
      setPortLabelsVisible(showPortLabels);
    }
  }, [showPortLabels, setPortLabelsVisible, graphRef]);

  // ── Show / hide interface cost labels ─────────────────────────────────────
  useEffect(() => {
    if (!graphRef.current) return;
    applyCostLabels(showCostLabels, buildCostMap(protocolConfig));
  }, [showCostLabels, protocolConfig, topologyData, applyCostLabels, graphRef]);

  // ── Apply route-pick A/B markers (right-click selected nodes) ─────────────
  useEffect(() => {
    if (!graphRef.current || !topologyData) return;
    const srcNode = routePickSource ? topologyData.nodes.find((n) => n.nodeName === routePickSource) : null;
    const dstNode = routePickDest   ? topologyData.nodes.find((n) => n.nodeName === routePickDest)   : null;
    setRoutePickMarkers(srcNode?.id ?? null, dstNode?.id ?? null);
  }, [routePickSource, routePickDest, topologyData, setRoutePickMarkers, graphRef]);

  // ── Highlight routing result (SPT or P2P path) ────────────────────────────
  useEffect(() => {
    if (graphRef.current) {
      highlightRoutingResult(routingResult, topologyData, routingP2PHighlight);
    }
  }, [routingResult, topologyData, routingP2PHighlight, highlightRoutingResult, graphRef]);

  return (
    <>
      <div
        id={CONTAINER_ID}
        ref={containerRef}
        className="w-full h-full bg-gray-950"
        onMouseMove={(e) => { mousePosRef.current = { x: e.clientX, y: e.clientY }; }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {contextMenu && (
        <div
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
          className="z-50 min-w-36 bg-gray-800 border border-gray-600 rounded shadow-xl text-sm text-white overflow-hidden"
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-700 truncate max-w-48">
            {contextMenu.nodeName}
          </div>
          <button
            onClick={() => { setRoutePickSource(contextMenu.nodeName); setContextMenu(null); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-500 text-white text-xs font-bold leading-none">A</span>
            设为起点
          </button>
          <button
            onClick={() => { setRoutePickDest(contextMenu.nodeName); setContextMenu(null); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-xs font-bold leading-none">B</span>
            设为终点
          </button>
        </div>
      )}
    </>
  );
}
