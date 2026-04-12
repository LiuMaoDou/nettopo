import { useTopoStore } from '../store/topoStore';

/**
 * Bottom status bar showing topology statistics.
 */
export default function StatusBar() {
  const { topologyData, currentLayout } = useTopoStore();
  if (!topologyData) return null;

  const { nodes, edges } = topologyData;
  const upCount = nodes.filter((n) => (n.status ?? 'up') === 'up').length;
  const downCount = nodes.filter((n) => n.status === 'down').length;
  const warnCount = nodes.filter((n) => n.status === 'warning').length;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gray-900 border-t border-gray-700 flex items-center px-4 text-xs text-gray-400 gap-6 z-10">
      <span>设备: {nodes.length}</span>
      <span>链路: {edges.length}</span>
      <span className="text-green-400">UP: {upCount}</span>
      {downCount > 0 && <span className="text-red-400">DOWN: {downCount}</span>}
      {warnCount > 0 && <span className="text-yellow-400">WARN: {warnCount}</span>}
      <span className="ml-auto capitalize">布局: {currentLayout}</span>
    </div>
  );
}
