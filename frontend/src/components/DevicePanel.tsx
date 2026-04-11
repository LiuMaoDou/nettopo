import { useTopoStore } from '../store/topoStore';

/**
 * Right-side panel showing details for the currently selected node.
 */
export default function DevicePanel() {
  const { selectedNode, setSelectedNode } = useTopoStore();
  if (!selectedNode) return null;

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-700 p-4 text-white overflow-y-auto z-10">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold truncate">{selectedNode.label}</h3>
        <button
          onClick={() => setSelectedNode(null)}
          className="text-gray-400 hover:text-white ml-2 flex-shrink-0"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <span className="text-gray-400">类型: </span>
          <span className="capitalize">{selectedNode.type}</span>
        </div>
        <div>
          <span className="text-gray-400">IP: </span>
          {selectedNode.ip}
        </div>
        <div>
          <span className="text-gray-400">状态: </span>
          <span
            className={
              selectedNode.status === 'up'
                ? 'text-green-400'
                : selectedNode.status === 'warning'
                  ? 'text-yellow-400'
                  : 'text-red-400'
            }
          >
            {selectedNode.status.toUpperCase()}
          </span>
        </div>
        {selectedNode.mac && (
          <div>
            <span className="text-gray-400">MAC: </span>
            {selectedNode.mac}
          </div>
        )}
        {selectedNode.vendor && (
          <div>
            <span className="text-gray-400">厂商: </span>
            {selectedNode.vendor}
          </div>
        )}
        {selectedNode.model && (
          <div>
            <span className="text-gray-400">型号: </span>
            {selectedNode.model}
          </div>
        )}
        {selectedNode.location && (
          <div>
            <span className="text-gray-400">位置: </span>
            {selectedNode.location}
          </div>
        )}
        {selectedNode.group && (
          <div>
            <span className="text-gray-400">分组: </span>
            {selectedNode.group}
          </div>
        )}
      </div>

      {selectedNode.interfaces.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold mb-2 text-sm">接口列表</h4>
          {selectedNode.interfaces.map((iface, idx) => (
            <div
              key={idx}
              className="text-xs text-gray-400 py-1 border-b border-gray-800"
            >
              {iface.name} — {iface.status}
              {iface.ip && ` — ${iface.ip}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
