import type { LayoutType } from '../types/topo';

/** Returns the G6 layout configuration for the given layout type (cast to LayoutOptions at call site). */
export function getLayoutConfig(type: LayoutType): Record<string, unknown> {
  const configs: Record<LayoutType, Record<string, unknown>> = {
    force: {
      type: 'force',
      preventOverlap: true,
      nodeStrength: -200,
      edgeStrength: 0.5,
      linkDistance: 150,
      gravity: 10,
      workerEnabled: true,
    },
    dagre: {
      type: 'dagre',
      rankdir: 'TB',
      nodesep: 50,
      ranksep: 100,
      align: 'UL',
    },
    circular: {
      type: 'circular',
      radius: 400,
      divisions: 5,
      ordering: 'degree',
    },
    radial: {
      type: 'radial',
      unitRadius: 120,
      linkDistance: 200,
      preventOverlap: true,
      nodeSize: 40,
    },
    combo: {
      type: 'comboCombined',
      spacing: 20,
      outerLayout: {
        type: 'force',
        gravity: 5,
      },
      innerLayout: {
        type: 'force',
        gravity: 15,
      },
    },
  };
  return configs[type] ?? configs.force;
}

export const LAYOUT_OPTIONS: { label: string; value: LayoutType }[] = [
  { label: '力导向 (Force)', value: 'force' },
  { label: '分层 (Hierarchical)', value: 'dagre' },
  { label: '环形 (Circular)', value: 'circular' },
  { label: '径向 (Radial)', value: 'radial' },
  { label: '分组 (Combo)', value: 'combo' },
];
