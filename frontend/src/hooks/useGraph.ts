import { useRef, useEffect, useCallback } from 'react';
import { Graph } from '@antv/g6';
import type { LayoutOptions } from '@antv/g6';
import { Renderer as WebGLRenderer } from '@antv/g-webgl';
import type { TopologyData, LayoutType, RoutingResult } from '../types/topo';
import { getLayoutConfig } from '../layouts';
import { graphRegistry } from '../store/graphRegistry';
import { registerPortLabelEdge } from '../graph/PortLabelEdge';

/** SVG icon paths served from /public/icons/ */
const ICON_MAP: Record<string, string> = {
  router:   '/icons/router.svg',
  switch:   '/icons/switch.svg',
  firewall: '/icons/firewall.svg',
  server:   '/icons/server.svg',
  ap:       '/icons/ap.svg',
  endpoint: '/icons/endpoint.svg',
};

/** Slugify a nodeName to its auto-generated node ID */
function slugifyId(str: string): string {
  return str.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Border color per device status */
const STATUS_STROKE: Record<string, string> = {
  up:      '#52c41a',
  down:    '#ff4d4f',
  warning: '#faad14',
};

/** Convert Gbps to a short string: 100 → "100G", 0.1 → "100M", 1000 → "1T" */
function fmtBw(gbps: number | undefined): string {
  if (!gbps) return '';
  if (gbps >= 1_000) return `${gbps / 1_000}T`;
  if (gbps >= 1)     return `${gbps}G`;
  return `${Math.round(gbps * 1_000)}M`;
}

/** Shared label background style */
const BG = {
  backgroundFill:    '#0f172a',
  backgroundOpacity: 0.75,
  backgroundRadius:  3,
  backgroundPadding: [2, 5, 2, 5],
} as const;

// ─── LOD (Level of Detail) thresholds ────────────────────────────────────────
/** Node count at which the renderer automatically switches from Canvas to WebGL */
export const WEBGL_NODE_THRESHOLD = 1000;
/** Hide edge port labels (start/end) when nodeCount exceeds this */
const LOD_NO_PORT_LABELS = 300;
/** Also hide edge center bandwidth labels when nodeCount exceeds this */
const LOD_NO_EDGE_LABELS = 700;
/** Also hide labels on leaf nodes (endpoint/server) when nodeCount exceeds this */
const LOD_NO_LEAF_LABELS = 900;
/** Hide node labels when zoom drops below this level */
const LOD_ZOOM_NODE = 0.5;
/** Hide edge labels when zoom drops below this level */
const LOD_ZOOM_EDGE = 0.65;

interface LodNodeEntry { label: string }
interface LodEdgeEntry {
  center: string | undefined;
  start:  string | undefined;
  end:    string | undefined;
}

/** Per-edge cost values from the active protocol config (srcCost / dstCost or srcMetric / dstMetric) */
export interface EdgeCostEntry { src: number; dst: number; }

/** Style applied to path edges in P2P mode — forward direction (arrow at target end) */
const P2P_ARROW_FWD: Record<string, unknown> = {
  endArrow: true, endArrowFill: '#f59e0b', endArrowStroke: '#f59e0b', endArrowSize: 10,
  startArrow: false,
};
/** Same, backward direction (path traverses edge target→source, so arrow at source end) */
const P2P_ARROW_BWD: Record<string, unknown> = {
  startArrow: true, startArrowFill: '#f59e0b', startArrowStroke: '#f59e0b', startArrowSize: 10,
  endArrow: false,
};
/** Restore to no-arrow state */
const P2P_ARROW_CLEAR: Record<string, unknown> = { endArrow: false, startArrow: false };

/**
 * Hook for managing a G6 Graph instance lifecycle.
 * The active graph is also registered in graphRegistry for cross-component access.
 */
export function useGraph(containerId: string) {
  const graphRef    = useRef<Graph | null>(null);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // LOD caches: store original label text so zoom handler can restore them
  const lodNodesRef = useRef<Map<string, LodNodeEntry>>(new Map());
  const lodEdgesRef = useRef<Map<string, LodEdgeEntry>>(new Map());
  // Track current LOD visibility state to avoid redundant updateData calls
  const lodStateRef = useRef({ nodeLabels: true, edgeLabels: true });

  // Route-pick markers (right-click A/B selection)
  const pickSourceIdRef = useRef<string | null>(null);
  const pickDestIdRef   = useRef<string | null>(null);
  // Per-node routing state (highlight/dim/[]) — used to re-apply pick markers without losing routing state
  const nodeRoutingStateRef = useRef<Map<string, string[]>>(new Map());
  // Edges that currently have P2P arrows — tracked so they can be restored on clear
  const p2pArrowEdgeIdsRef  = useRef<string[]>([]);

  // Tracks which renderer is currently active so TopologyCanvas can detect switches
  const rendererTypeRef = useRef<'canvas' | 'webgl'>('canvas');

  // Cost label data and visibility state
  const costDataRef   = useRef<Map<string, EdgeCostEntry>>(new Map());
  const showCostRef   = useRef(false);
  // Mirror of the store's showPortLabels — kept in sync by setPortLabelsVisible()
  const showPortRef   = useRef(true);

  /**
   * Central edge-label refresh.
   * Rebuilds all four endpoint label properties for every edge,
   * respecting zoom LOD, port-label toggle, and cost-label toggle.
   *
   * Port labels (startLabelText / endLabelText) — gray, above the edge line.
   * Cost badges (costStartLabelText / costEndLabelText) — amber, below the edge line.
   *
   * Does NOT call draw() — callers must do so.
   */
  const refreshEdgeLabels = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !lodEdgesRef.current.size) return;

    const showEdgeLOD = lodStateRef.current.edgeLabels;
    const showPort    = showPortRef.current;
    const showCost    = showCostRef.current;

    const edgeUpdates: { id: string; style: Record<string, unknown> }[] = [];
    lodEdgesRef.current.forEach((entry, id) => {
      const cost = costDataRef.current.get(id);
      edgeUpdates.push({ id, style: {
        // Center bandwidth label
        labelText:           showEdgeLOD ? entry.center : undefined,
        // Port labels (interface + util) — above edge, gray
        startLabelText:      showEdgeLOD && showPort ? entry.start : undefined,
        endLabelText:        showEdgeLOD && showPort ? entry.end   : undefined,
        // Cost badges — below edge, amber (rendered by PortLabelEdge)
        costStartLabelText:  showEdgeLOD && showCost && cost !== undefined ? `c${cost.src}` : undefined,
        costEndLabelText:    showEdgeLOD && showCost && cost !== undefined ? `c${cost.dst}` : undefined,
      }});
    });

    graph.updateData({ edges: edgeUpdates });
  }, []);

  /**
   * Apply zoom-based label visibility.
   * Called (debounced) on every zoom event.
   * Only triggers a graph update when visibility state actually changes.
   */
  const applyZoomLOD = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const zoom = graph.getZoom();
    const showNodeLabels = zoom >= LOD_ZOOM_NODE;
    const showEdgeLabels = zoom >= LOD_ZOOM_EDGE;

    const prev = lodStateRef.current;
    if (showNodeLabels === prev.nodeLabels && showEdgeLabels === prev.edgeLabels) return;
    lodStateRef.current = { nodeLabels: showNodeLabels, edgeLabels: showEdgeLabels };

    // Node label updates
    const nodeUpdates: { id: string; style: Record<string, unknown> }[] = [];
    lodNodesRef.current.forEach((entry, id) => {
      nodeUpdates.push({ id, style: { labelText: showNodeLabels ? entry.label : '' } });
    });

    if (nodeUpdates.length) {
      graph.updateData({ nodes: nodeUpdates });
    }

    // Edge label updates (center + endpoints with port/cost) via shared helper
    refreshEdgeLabels();
    graph.draw();
  }, [refreshEdgeLabels]);

  /**
   * Initialize (or re-initialize) the G6 graph.
   * Safe to call multiple times — destroys any previous instance first.
   *
   * NOTE: Do NOT set labelText in the global node defaults — an empty string
   * causes G6 to skip rendering labels for ALL nodes (it checks !labelText).
   * Set labelText per-node in loadData instead.
   */
  const initGraph = useCallback((rendererType: 'canvas' | 'webgl' = 'canvas') => {
    clearTimeout(zoomTimerRef.current);
    if (graphRef.current) graphRef.current.destroy();

    rendererTypeRef.current = rendererType;
    registerPortLabelEdge();

    const graph = new Graph({
      container: containerId,
      autoFit: 'view',
      renderer: rendererType === 'webgl' ? () => new WebGLRenderer() : undefined,
      // Cap pixel ratio: retina screens would otherwise render at 2–3×,
      // multiplying canvas pixels and fill/stroke ops for every element.
      devicePixelRatio: Math.min(window.devicePixelRatio, 1.5),
      node: {
        type: 'circle',
        style: {
          size: 36,
          fill: '#1e293b',
          lineWidth: 1.5,
          icon: true,
          iconWidth: 22,
          iconHeight: 22,
          // label defaults (text will be set per-node in loadData)
          labelPlacement:        'bottom',
          labelFontSize:         11,
          labelFill:             '#e2e8f0',
          labelBackground:       true,
          labelBackgroundFill:    BG.backgroundFill,
          labelBackgroundOpacity: BG.backgroundOpacity,
          labelBackgroundRadius:  BG.backgroundRadius,
          labelBackgroundPadding: BG.backgroundPadding,
        },
        state: {
          selected:       { lineWidth: 3, stroke: '#3b82f6' },
          highlight:      { lineWidth: 3, stroke: '#f59e0b' },
          dim:            { fillOpacity: 0.12, strokeOpacity: 0.12, labelOpacity: 0.1, iconOpacity: 0.12 },
          // Route-pick markers (right-click A/B); applied AFTER routing states so they win
          // Cyan for source A (avoids conflict with status-up green #52c41a)
          'route-source': { lineWidth: 3, stroke: '#06b6d4', fill: '#082f49' },
          'route-dest':   { lineWidth: 3, stroke: '#ef4444', fill: '#2d0b0b' },
        } as Record<string, object>,
      },
      edge: {
        type: 'port-label-edge',
        style: {
          stroke: '#475569',
          lineWidth: 1.5,
          endArrow: false,
          // label / badge defaults (text set per-edge in loadData)
          labelFontSize:         9,
          labelFill:             '#94a3b8',
          labelBackground:       true,
          labelBackgroundFill:    BG.backgroundFill,
          labelBackgroundOpacity: BG.backgroundOpacity,
          labelBackgroundRadius:  BG.backgroundRadius,
          labelBackgroundPadding: BG.backgroundPadding,
          badgeFontSize:         9,
          badgeFill:             '#94a3b8',
          badgeBackground:       true,
          badgeBackgroundFill:    BG.backgroundFill,
          badgeBackgroundOpacity: BG.backgroundOpacity,
          badgeBackgroundRadius:  BG.backgroundRadius,
          badgeBackgroundPadding: BG.backgroundPadding,
        },
        state: {
          highlight: { stroke: '#f59e0b', lineWidth: 3 },
          dim:       { opacity: 0.07 },
        },
      },
      combo: {
        type: 'rect',
        style: {
          fillOpacity: 0.04,
          stroke: '#334155',
          radius: 8,
          padding: [20, 20, 20, 20],
          labelFill:    '#64748b',
          labelFontSize: 11,
          labelPlacement: 'top',
        },
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element', 'click-select'],
    });

    // Zoom-based LOD: debounce to avoid thrashing on continuous pinch/scroll
    graph.on('afterzoom', () => {
      clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = setTimeout(applyZoomLOD, 150);
    });

    graphRef.current = graph;
    graphRegistry.set(graph);
    return graph;
  }, [containerId, applyZoomLOD]);

  /**
   * Load topology data into the graph and render it.
   *
   * LOD strategy:
   *   nodeCount > 300  → suppress edge port labels (start/end): removes ~2× nodeCount text shapes
   *   nodeCount > 700  → also suppress edge center (bandwidth) labels
   *   nodeCount > 900  → also suppress labels on leaf nodes (endpoint/server)
   *
   * Zoom-based LOD runs after the initial render via the 'afterzoom' event.
   */
  const loadData = useCallback((data: TopologyData) => {
    const graph = graphRef.current;
    if (!graph) return;

    // New topology — reset all derived state
    nodeRoutingStateRef.current.clear();
    p2pArrowEdgeIdsRef.current = [];
    pickSourceIdRef.current = null;
    pickDestIdRef.current = null;
    costDataRef.current = new Map(); // cost data invalidated by topology change

    const nodeCount = data.nodes.length;

    // Combo layout breaks at scale; skip combos above threshold
    const useCombos      = nodeCount <= 500;
    // Label LOD flags derived from static thresholds
    const showPortLabels = nodeCount <= LOD_NO_PORT_LABELS;
    const showEdgeCtr    = nodeCount <= LOD_NO_EDGE_LABELS;
    const showLeafLabels = nodeCount <= LOD_NO_LEAF_LABELS;

    // Reset zoom-LOD state for this dataset
    lodStateRef.current = { nodeLabels: true, edgeLabels: true };
    const nodeCache = new Map<string, LodNodeEntry>();
    const edgeCache = new Map<string, LodEdgeEntry>();

    // Build nodeName → node ID lookup to resolve edge endpoints
    const nodeNameToId = new Map<string, string>();
    data.nodes.forEach((n) => {
      nodeNameToId.set(n.nodeName, n.id);
      nodeNameToId.set(slugifyId(n.nodeName), n.id);
    });

    const g6Data = {
      nodes: data.nodes.map((n) => {
        const isSmall = n.type === 'endpoint' || n.type === 'server';
        nodeCache.set(n.id, { label: n.nodeName });
        const nodeStatus = n.status ?? 'up';
        return {
          id: n.id,
          data: { ...n },
          combo: useCombos && n.group && n.group !== 'default' ? n.group : undefined,
          style: {
            // Shape
            size:      isSmall ? 28 : 36,
            fill:      '#1e293b',
            stroke:    STATUS_STROKE[nodeStatus] ?? STATUS_STROKE.up,
            lineWidth: nodeStatus === 'down' ? 2.5 : 1.5,
            lineDash:  nodeStatus === 'down' ? [4, 3] : undefined,
            // Icon
            iconSrc:    ICON_MAP[n.type] ?? ICON_MAP.endpoint,
            iconWidth:  isSmall ? 16 : 22,
            iconHeight: isSmall ? 16 : 22,
            // Label: leaf nodes hidden at high node counts to reduce text shapes
            labelText: (showLeafLabels || !isSmall) ? n.nodeName : '',
          },
        };
      }),

      edges: data.edges.map((e) => {
        const bw = fmtBw(e.src.bandwidth ?? e.dst.bandwidth);

        const srcUtil  = e.src.utilizationOut !== undefined ? `${Math.round(e.src.utilizationOut * 100)}%` : '';
        const dstUtil  = e.dst.utilizationOut !== undefined ? `${Math.round(e.dst.utilizationOut * 100)}%` : '';
        const startLabel = e.src.interface
          ? (srcUtil ? `${e.src.interface}(${srcUtil})` : e.src.interface)
          : srcUtil;
        const endLabel = e.dst.interface
          ? (dstUtil ? `${e.dst.interface}(${dstUtil})` : e.dst.interface)
          : dstUtil;

        // Store full label data so zoom-LOD can restore them later
        edgeCache.set(e.id, {
          center: bw         || undefined,
          start:  startLabel || undefined,
          end:    endLabel   || undefined,
        });

        const maxUtil = Math.max(e.src.utilizationOut ?? 0, e.dst.utilizationOut ?? 0);
        const isDown = e.src.status === 'down' || e.dst.status === 'down';
        const edgeColor = isDown
          ? '#ef4444'
          : maxUtil > 0.8
            ? '#f97316'
            : maxUtil > 0.5
              ? '#eab308'
              : '#475569';

        const srcId = nodeNameToId.get(e.src.nodeName) ?? slugifyId(e.src.nodeName);
        const dstId = nodeNameToId.get(e.dst.nodeName) ?? slugifyId(e.dst.nodeName);
        const bwGbps = e.src.bandwidth ?? e.dst.bandwidth ?? 1;

        return {
          id: e.id,
          source: srcId,
          target: dstId,
          data: { ...e },
          style: {
            lineWidth: Math.max(1, Math.min(5, bwGbps / 8)),
            stroke:    edgeColor,
            lineDash:  isDown ? [4, 3] : undefined,
            opacity:   0.85,

            // Utilization labels suppressed for large graphs
            startLabelText: showPortLabels ? (startLabel || undefined) : undefined,
            endLabelText:   showPortLabels ? (endLabel   || undefined) : undefined,

            // Center bandwidth label suppressed for very large graphs
            labelText:      showEdgeCtr ? (bw || undefined) : undefined,
            labelPlacement: 0.5,
            labelFill:      edgeColor,
          },
        };
      }),

      combos: useCombos
        ? [...new Set(data.nodes.map((n) => n.group).filter((g): g is string => !!g && g !== 'default'))]
            .map((g) => ({ id: g, data: { id: g }, style: { labelText: g } }))
        : [],
    };

    lodNodesRef.current = nodeCache;
    lodEdgesRef.current = edgeCache;

    graph.setData(g6Data);
    graph.render();
  }, []);

  /**
   * Switch layout algorithm.
   */
  const changeLayout = useCallback((layoutType: LayoutType) => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.setLayout(getLayoutConfig(layoutType) as LayoutOptions);
    graph.layout();
  }, []);

  /**
   * Highlight nodes/edges matching query; dim everything else.
   * Pass empty string to clear.
   */
  const applySearch = useCallback((query: string, data: TopologyData | null) => {
    const graph = graphRef.current;
    if (!graph || !data) return;

    if (!query.trim()) {
      data.nodes.forEach((n) => graph.setElementState(n.id, []));
      data.edges.forEach((e) => graph.setElementState(e.id, []));
      return;
    }

    const lower = query.toLowerCase();
    const matchedIds = new Set<string>();

    data.nodes.forEach((n) => {
      const hit =
        n.nodeName.toLowerCase().includes(lower) ||
        (n.group ?? '').toLowerCase().includes(lower) ||
        (n.vendor ?? '').toLowerCase().includes(lower);

      graph.setElementState(n.id, hit ? ['highlight'] : ['dim']);
      if (hit) matchedIds.add(n.id);
    });

    data.edges.forEach((e) => {
      const srcId = slugifyId(e.src.nodeName);
      const dstId = slugifyId(e.dst.nodeName);
      const linked = matchedIds.has(srcId) || matchedIds.has(dstId);
      graph.setElementState(e.id, linked ? [] : ['dim']);
    });
  }, []);

  /**
   * Show or hide port labels (interface + utilisation) on all edge endpoints.
   * Respects zoom LOD and the current cost-label toggle.
   */
  const setPortLabelsVisible = useCallback((visible: boolean) => {
    const graph = graphRef.current;
    if (!graph) return;
    showPortRef.current = visible;
    refreshEdgeLabels();
    graph.draw();
  }, [refreshEdgeLabels]);

  /**
   * Update which cost values are shown on edge endpoints.
   * @param visible  - whether the cost badge (e.g. "c10") should be shown
   * @param costMap  - edgeId → { src, dst } costs; pass null to clear all costs
   */
  const applyCostLabels = useCallback(
    (visible: boolean, costMap: Map<string, EdgeCostEntry> | null) => {
      const graph = graphRef.current;
      if (!graph) return;
      showCostRef.current    = visible;
      costDataRef.current    = costMap ?? new Map();
      refreshEdgeLabels();
      graph.draw();
    },
    [refreshEdgeLabels],
  );

  /**
   * Highlight a single point-to-point path (subset of SPT).
   * pathEdgeIds: edges on this path; pathNodeIds: topo node ids on this path.
   * Everything else is dimmed.
   */
  const highlightPath = useCallback(
    (pathEdgeIds: string[], pathNodeIds: string[], data: TopologyData | null) => {
      const graph = graphRef.current;
      if (!graph || !data) return;

      const edgeSet = new Set(pathEdgeIds);
      const nodeSet = new Set(pathNodeIds);

      data.nodes.forEach((n) => {
        graph.setElementState(n.id, nodeSet.has(n.id) ? ['highlight'] : ['dim']);
      });
      data.edges.forEach((e) => {
        graph.setElementState(e.id, edgeSet.has(e.id) ? ['highlight'] : ['dim']);
      });
    },
    [],
  );

  /**
   * Highlight routing result on the canvas.
   *
   * - When `p2pOverride` is provided (P2P mode): only highlight the specific
   *   A→B path using the pre-computed topo IDs; adds directional arrows; dims everything else.
   * - When `p2pOverride` is null/undefined (SPT mode): highlight the full SPT.
   * - When `result` is null: clear all routing highlight, restore node labels, remove arrows.
   *
   * In all cases, route-pick markers (A/B right-click selections) are preserved on top of
   * whatever routing state is set.
   */
  const highlightRoutingResult = useCallback(
    (
      result: RoutingResult | null,
      data: TopologyData | null,
      p2pOverride?: { pathNodeTopoIds: string[]; pathEdgeIds: string[] } | null,
    ) => {
      const graph = graphRef.current;
      if (!graph || !data) return;

      const srcPick = pickSourceIdRef.current;
      const dstPick = pickDestIdRef.current;

      /** Append route-pick states (route-source / route-dest) after routing states so they win. */
      const withPickStates = (nodeId: string, base: string[]): string[] => [
        ...base,
        ...(nodeId === srcPick ? ['route-source'] : []),
        ...(nodeId === dstPick ? ['route-dest'] : []),
      ];

      /** Restore arrow-free style on edges that previously had P2P arrows. */
      const clearArrows = () => {
        const prev = p2pArrowEdgeIdsRef.current;
        if (!prev.length) return;
        graph.updateData({ edges: prev.map((id) => ({ id, style: P2P_ARROW_CLEAR })) });
        p2pArrowEdgeIdsRef.current = [];
      };

      if (!result) {
        nodeRoutingStateRef.current.clear();
        clearArrows();
        const nodeUpdates: { id: string; style: Record<string, unknown> }[] = [];
        data.nodes.forEach((n) => {
          nodeRoutingStateRef.current.set(n.id, []);
          graph.setElementState(n.id, withPickStates(n.id, []));
          nodeUpdates.push({ id: n.id, style: { labelText: n.nodeName } });
        });
        data.edges.forEach((e) => graph.setElementState(e.id, []));
        graph.updateData({ nodes: nodeUpdates });
        graph.draw();
        return;
      }

      if (p2pOverride) {
        // P2P mode: highlight only the A→B path + directional arrows
        const pathNodeSet = new Set(p2pOverride.pathNodeTopoIds);
        const pathEdgeSet = new Set(p2pOverride.pathEdgeIds);

        // Build a nodeName→topoId lookup to determine edge traversal direction
        const nodeNameToId = new Map<string, string>();
        data.nodes.forEach((n) => nodeNameToId.set(n.nodeName, n.id));

        const nodeUpdates: { id: string; style: Record<string, unknown> }[] = [];
        data.nodes.forEach((n) => {
          const routingStates = pathNodeSet.has(n.id) ? ['highlight'] : ['dim'];
          nodeRoutingStateRef.current.set(n.id, routingStates);
          graph.setElementState(n.id, withPickStates(n.id, routingStates));
          nodeUpdates.push({ id: n.id, style: { labelText: n.nodeName } });
        });
        data.edges.forEach((e) => {
          graph.setElementState(e.id, pathEdgeSet.has(e.id) ? ['highlight'] : ['dim']);
        });

        // Restore previous arrows then add directional arrows on new path
        clearArrows();
        const arrowUpdates = p2pOverride.pathEdgeIds.map((eid, i) => {
          const fromNodeId = p2pOverride.pathNodeTopoIds[i];
          const edge = data.edges.find((e) => e.id === eid);
          const edgeSrcId = edge ? nodeNameToId.get(edge.src.nodeName) : undefined;
          const isForward = edgeSrcId === fromNodeId;
          return { id: eid, style: isForward ? P2P_ARROW_FWD : P2P_ARROW_BWD };
        });
        p2pArrowEdgeIdsRef.current = [...p2pOverride.pathEdgeIds];

        graph.updateData({ nodes: nodeUpdates, edges: arrowUpdates });
        graph.draw();
        return;
      }

      // SPT mode: highlight all reachable nodes and SPT edges, show cost labels
      clearArrows();
      const sptEdgeSet = new Set(result.sptEdgeIds);
      const reachableNodeSet = new Set(result.nodeIds);

      const nodeUpdates: { id: string; style: Record<string, unknown> }[] = [];
      data.nodes.forEach((n) => {
        const isReachable = reachableNodeSet.has(n.id);
        const routingStates = isReachable ? ['highlight'] : ['dim'];
        nodeRoutingStateRef.current.set(n.id, routingStates);
        graph.setElementState(n.id, withPickStates(n.id, routingStates));
        const cost = result.nodeIdToCost[n.id];
        const costLabel = cost !== undefined ? ` (cost ${cost})` : '';
        nodeUpdates.push({ id: n.id, style: { labelText: `${n.nodeName}${isReachable ? costLabel : ''}` } });
      });

      data.edges.forEach((e) => {
        graph.setElementState(e.id, sptEdgeSet.has(e.id) ? ['highlight'] : ['dim']);
      });

      if (nodeUpdates.length) {
        graph.updateData({ nodes: nodeUpdates });
        graph.draw();
      }
    },
    [],
  );

  /**
   * Mark a node as route-pick source (A, green) or destination (B, red).
   * The pick state is layered on top of any active routing highlight state.
   * Pass null to clear a marker.
   */
  const setRoutePickMarkers = useCallback(
    (sourceId: string | null, destId: string | null) => {
      const graph = graphRef.current;
      if (!graph) return;

      const prevSource = pickSourceIdRef.current;
      const prevDest   = pickDestIdRef.current;
      pickSourceIdRef.current = sourceId;
      pickDestIdRef.current   = destId;

      // Collect affected node IDs (old + new markers)
      const affected = new Set<string>(
        [prevSource, prevDest, sourceId, destId].filter((id): id is string => !!id),
      );

      affected.forEach((nodeId) => {
        const routing = nodeRoutingStateRef.current.get(nodeId) ?? [];
        const pick = [
          ...(nodeId === sourceId ? ['route-source'] : []),
          ...(nodeId === destId   ? ['route-dest']   : []),
        ];
        graph.setElementState(nodeId, [...routing, ...pick]);
      });

      graph.draw();
    },
    [],
  );

  useEffect(() => {
    return () => {
      clearTimeout(zoomTimerRef.current);
      graphRef.current?.destroy();
      graphRef.current = null;
      graphRegistry.set(null);
    };
  }, []);

  return { graphRef, rendererTypeRef, initGraph, loadData, changeLayout, applySearch, setPortLabelsVisible, applyCostLabels, highlightRoutingResult, highlightPath, setRoutePickMarkers };
}
