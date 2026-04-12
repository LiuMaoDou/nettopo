import { useRef, useEffect, useCallback } from 'react';
import { Graph } from '@antv/g6';
import type { LayoutOptions } from '@antv/g6';
import type { TopologyData, LayoutType } from '../types/topo';
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

    // Build batched node style updates
    const nodeUpdates: { id: string; style: Record<string, unknown> }[] = [];
    lodNodesRef.current.forEach((entry, id) => {
      // Empty string tells G6 to hide the label shape (same check as !labelText)
      nodeUpdates.push({ id, style: { labelText: showNodeLabels ? entry.label : '' } });
    });

    // Build batched edge style updates
    const edgeUpdates: { id: string; style: Record<string, unknown> }[] = [];
    lodEdgesRef.current.forEach((entry, id) => {
      edgeUpdates.push({ id, style: {
        labelText:      showEdgeLabels ? entry.center : undefined,
        startLabelText: showEdgeLabels ? entry.start  : undefined,
        endLabelText:   showEdgeLabels ? entry.end    : undefined,
      }});
    });

    if (nodeUpdates.length || edgeUpdates.length) {
      graph.updateData({ nodes: nodeUpdates, edges: edgeUpdates });
      graph.draw();
    }
  }, []);

  /**
   * Initialize (or re-initialize) the G6 graph.
   * Safe to call multiple times — destroys any previous instance first.
   *
   * NOTE: Do NOT set labelText in the global node defaults — an empty string
   * causes G6 to skip rendering labels for ALL nodes (it checks !labelText).
   * Set labelText per-node in loadData instead.
   */
  const initGraph = useCallback(() => {
    clearTimeout(zoomTimerRef.current);
    if (graphRef.current) graphRef.current.destroy();

    registerPortLabelEdge();

    const graph = new Graph({
      container: containerId,
      autoFit: 'view',
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
          selected:  { lineWidth: 3, stroke: '#3b82f6' },
          highlight: { lineWidth: 3, stroke: '#f59e0b' },
          dim:       { fillOpacity: 0.12, strokeOpacity: 0.12, labelOpacity: 0.1, iconOpacity: 0.12 },
        },
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
   * Show or hide port labels (startLabelText / endLabelText) on all edges.
   * Respects the existing LOD zoom state — when re-showing, only restores
   * labels if the current zoom level is above the edge-label threshold.
   */
  const setPortLabelsVisible = useCallback((visible: boolean) => {
    const graph = graphRef.current;
    if (!graph) return;

    const showEdgeLabels = lodStateRef.current.edgeLabels;
    const edgeUpdates: { id: string; style: Record<string, unknown> }[] = [];

    lodEdgesRef.current.forEach((entry, id) => {
      edgeUpdates.push({ id, style: {
        startLabelText: visible && showEdgeLabels ? entry.start : undefined,
        endLabelText:   visible && showEdgeLabels ? entry.end   : undefined,
      }});
    });

    if (edgeUpdates.length) {
      graph.updateData({ edges: edgeUpdates });
      graph.draw();
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(zoomTimerRef.current);
      graphRef.current?.destroy();
      graphRef.current = null;
      graphRegistry.set(null);
    };
  }, []);

  return { graphRef, initGraph, loadData, changeLayout, applySearch, setPortLabelsVisible };
}
