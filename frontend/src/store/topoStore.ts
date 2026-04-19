import { create } from 'zustand';
import type { TopologyData, LayoutType, TopoNode, ProtocolConfig, RoutingResult } from '../types/topo';
import { generateMockTopology } from '../utils/mockData';

/** P2P 路径高亮信息（topo 层 ID，已完成 routerId → nodeId 映射） */
export interface RoutingP2PHighlight {
  pathNodeTopoIds: string[];
  pathEdgeIds: string[];
}

interface TopoState {
  topologyData: TopologyData | null;
  currentLayout: LayoutType;
  selectedNode: TopoNode | null;
  searchQuery: string;
  showPortLabels: boolean;
  /** 在 edge 端点标签上叠加显示接口 cost/metric 值（需加载协议配置） */
  showCostLabels: boolean;
  protocolConfig: ProtocolConfig | null;
  routingResult: RoutingResult | null;
  /** P2P 模式下当前高亮路径（topo ID），null 表示使用 SPT 高亮 */
  routingP2PHighlight: RoutingP2PHighlight | null;
  /** 右键标记的起点节点名（用于路由分析 A 点） */
  routePickSource: string | null;
  /** 右键标记的终点节点名（用于路由分析 B 点） */
  routePickDest: string | null;
  // actions
  setTopologyData: (data: TopologyData) => void;
  setLayout: (layout: LayoutType) => void;
  setSelectedNode: (node: TopoNode | null) => void;
  setSearchQuery: (query: string) => void;
  loadMockData: (scale: 'small' | 'medium' | 'large') => void;
  togglePortLabels: () => void;
  toggleCostLabels: () => void;
  setProtocolConfig: (config: ProtocolConfig | null) => void;
  setRoutingResult: (result: RoutingResult | null) => void;
  setRoutingP2PHighlight: (highlight: RoutingP2PHighlight | null) => void;
  clearRoutingResult: () => void;
  setRoutePickSource: (nodeName: string | null) => void;
  setRoutePickDest: (nodeName: string | null) => void;
}

export const useTopoStore = create<TopoState>((set) => ({
  topologyData: null,
  currentLayout: 'dagre',
  selectedNode: null,
  searchQuery: '',
  showPortLabels: true,
  showCostLabels: false,
  protocolConfig: null,
  routingResult: null,
  routingP2PHighlight: null,
  routePickSource: null,
  routePickDest: null,
  setTopologyData: (data) => set({ topologyData: data }),
  setLayout: (layout) => set({ currentLayout: layout }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  togglePortLabels: () => set((s) => ({ showPortLabels: !s.showPortLabels })),
  toggleCostLabels: () => set((s) => ({ showCostLabels: !s.showCostLabels })),
  loadMockData: (scale) =>
    set({
      topologyData: generateMockTopology(scale),
      // force layout runs in a Web Worker — non-blocking for large datasets
      ...(scale === 'large' ? { currentLayout: 'force' } : {}),
    }),
  setProtocolConfig: (config) => set({ protocolConfig: config }),
  setRoutingResult: (result) => set({ routingResult: result }),
  setRoutingP2PHighlight: (highlight) => set({ routingP2PHighlight: highlight }),
  clearRoutingResult: () => set({ routingResult: null, routingP2PHighlight: null }),
  setRoutePickSource: (nodeName) => set({ routePickSource: nodeName }),
  setRoutePickDest: (nodeName) => set({ routePickDest: nodeName }),
}));
