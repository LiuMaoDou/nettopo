import { create } from 'zustand';
import type { TopologyData, LayoutType, TopoNode } from '../types/topo';
import { generateMockTopology } from '../utils/mockData';

interface TopoState {
  topologyData: TopologyData | null;
  currentLayout: LayoutType;
  selectedNode: TopoNode | null;
  searchQuery: string;
  // actions
  setTopologyData: (data: TopologyData) => void;
  setLayout: (layout: LayoutType) => void;
  setSelectedNode: (node: TopoNode | null) => void;
  setSearchQuery: (query: string) => void;
  loadMockData: (scale: 'small' | 'medium' | 'large') => void;
}

export const useTopoStore = create<TopoState>((set) => ({
  topologyData: null,
  currentLayout: 'dagre',
  selectedNode: null,
  searchQuery: '',
  setTopologyData: (data) => set({ topologyData: data }),
  setLayout: (layout) => set({ currentLayout: layout }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  loadMockData: (scale) =>
    set({ topologyData: generateMockTopology(scale) }),
}));
