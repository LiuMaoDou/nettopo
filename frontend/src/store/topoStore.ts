import { create } from 'zustand';
import type { TopologyData, LayoutType, TopoNode } from '../types/topo';
import { generateMockTopology } from '../utils/mockData';

interface TopoState {
  topologyData: TopologyData | null;
  currentLayout: LayoutType;
  selectedNode: TopoNode | null;
  searchQuery: string;
  showPortLabels: boolean;
  // actions
  setTopologyData: (data: TopologyData) => void;
  setLayout: (layout: LayoutType) => void;
  setSelectedNode: (node: TopoNode | null) => void;
  setSearchQuery: (query: string) => void;
  loadMockData: (scale: 'small' | 'medium' | 'large') => void;
  togglePortLabels: () => void;
}

export const useTopoStore = create<TopoState>((set) => ({
  topologyData: null,
  currentLayout: 'dagre',
  selectedNode: null,
  searchQuery: '',
  showPortLabels: true,
  setTopologyData: (data) => set({ topologyData: data }),
  setLayout: (layout) => set({ currentLayout: layout }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  togglePortLabels: () => set((s) => ({ showPortLabels: !s.showPortLabels })),
  loadMockData: (scale) =>
    set({
      topologyData: generateMockTopology(scale),
      // force layout runs in a Web Worker — non-blocking for large datasets
      ...(scale === 'large' ? { currentLayout: 'force' } : {}),
    }),
}));
