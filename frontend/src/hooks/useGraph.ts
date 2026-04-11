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

/** Border color per device status */
const STATUS_STROKE: Record<string, string> = {
  up:      '#52c41a',
  down:    '#ff4d4f',
  warning: '#faad14',
};

/** Convert Mbps to a short string: 100000 → "100G", 1000 → "1G", 100 → "100M" */
function fmtBw(mbps: number | undefined): string {
  if (!mbps) return '';
  if (mbps >= 1_000_000) return `${mbps / 1_000_000}T`;
  if (mbps >= 1_000)     return `${mbps / 1_000}G`;
  return `${mbps}M`;
}

/** Shared label background style (prefix with 'label' or 'badge' at call site) */
const BG = {
  backgroundFill:    '#0f172a',
  backgroundOpacity: 0.75,
  backgroundRadius:  3,
  backgroundPadding: [2, 5, 2, 5],
} as const;

/**
 * Hook for managing a G6 Graph instance lifecycle.
 * The active graph is also registered in graphRegistry for cross-component access.
 */
export function useGraph(containerId: string) {
  const graphRef = useRef<Graph | null>(null);

  /**
   * Initialize (or re-initialize) the G6 graph.
   * Safe to call multiple times — destroys any previous instance first.
   *
   * NOTE: Do NOT set labelText in the global node defaults — an empty string
   * causes G6 to skip rendering labels for ALL nodes (it checks !labelText).
   * Set labelText per-node in loadData instead.
   */
  const initGraph = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.destroy();
    }

    registerPortLabelEdge();

    const graph = new Graph({
      container: containerId,
      autoFit: 'view',
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

    graphRef.current = graph;
    graphRegistry.set(graph);
    return graph;
  }, [containerId]);

  /**
   * Load topology data into the graph and render it.
   */
  const loadData = useCallback((data: TopologyData) => {
    const graph = graphRef.current;
    if (!graph) return;

    const g6Data = {
      nodes: data.nodes.map((n) => {
        const isSmall = n.type === 'endpoint' || n.type === 'server';
        return {
          id: n.id,
          data: { ...n },
          combo: n.group ?? undefined,
          style: {
            // Shape
            size:      isSmall ? 28 : 36,
            fill:      '#1e293b',
            stroke:    STATUS_STROKE[n.status] ?? STATUS_STROKE.up,
            lineWidth: n.status === 'down' ? 2.5 : 1.5,
            lineDash:  n.status === 'down' ? [4, 3] : undefined,
            // Icon
            iconSrc:    ICON_MAP[n.type] ?? ICON_MAP.endpoint,
            iconWidth:  isSmall ? 16 : 22,
            iconHeight: isSmall ? 16 : 22,
            // Node label — must be set here, NOT in global defaults (empty string suppresses all labels)
            labelText: n.label,
          },
        };
      }),

      edges: data.edges.map((e) => {
        const srcPort = e.sourcePort || '';
        const dstPort = e.targetPort || '';
        const bw      = fmtBw(e.bandwidth);

        // Endpoint labels: "G0/1 →50%" near source, "20%← G0/2" near target
        const outPct = e.utilizationOut !== undefined
          ? `${Math.round(e.utilizationOut * 100)}%` : '';
        const inPct  = e.utilizationIn  !== undefined
          ? `${Math.round(e.utilizationIn  * 100)}%` : '';

        const startLabel = srcPort
          ? outPct ? `${srcPort}(${outPct})` : srcPort
          : outPct ? `(${outPct})` : '';
        const endLabel = dstPort
          ? inPct ? `${dstPort}(${inPct})` : dstPort
          : inPct ? `(${inPct})` : '';

        // Edge color driven by the higher of the two directions
        const maxUtil = Math.max(e.utilizationOut ?? 0, e.utilizationIn ?? 0);
        const edgeColor =
          e.status === 'down'
            ? '#ef4444'
            : maxUtil > 0.8
              ? '#f97316'
              : maxUtil > 0.5
                ? '#eab308'
                : '#475569';

        return {
          id: e.id,
          source: e.source,
          target: e.target,
          data: { ...e },
          style: {
            lineWidth: Math.max(1, Math.min(5, (e.bandwidth ?? 1000) / 8000)),
            stroke:    edgeColor,
            lineDash:  e.status === 'down' ? [4, 3] : undefined,
            opacity:   0.85,

            // Port + utilization labels at each endpoint
            startLabelText: startLabel || undefined,
            endLabelText:   endLabel   || undefined,

            // Center label: bandwidth only
            labelText:      bw || undefined,
            labelPlacement: 0.5,
            labelFill:      edgeColor,
          },
        };
      }),

      combos: data.groups.map((g) => ({
        id: g.id,
        data: { ...g },
        style: { labelText: g.label },
      })),
    };

    graph.setData(g6Data);
    graph.render();
  }, []);

  /**
   * Switch layout algorithm with animation.
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
        n.label.toLowerCase().includes(lower) ||
        n.ip.toLowerCase().includes(lower) ||
        (n.group ?? '').toLowerCase().includes(lower) ||
        (n.vendor ?? '').toLowerCase().includes(lower);

      graph.setElementState(n.id, hit ? ['highlight'] : ['dim']);
      if (hit) matchedIds.add(n.id);
    });

    data.edges.forEach((e) => {
      const linked = matchedIds.has(e.source) || matchedIds.has(e.target);
      graph.setElementState(e.id, linked ? [] : ['dim']);
    });
  }, []);

  useEffect(() => {
    return () => {
      graphRef.current?.destroy();
      graphRef.current = null;
      graphRegistry.set(null);
    };
  }, []);

  return { graphRef, initGraph, loadData, changeLayout, applySearch };
}
