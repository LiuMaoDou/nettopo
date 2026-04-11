import { useEffect, useRef, useCallback } from 'react';
import { useTopoStore } from '../store/topoStore';
import type { TopoNode } from '../types/topo';

interface WsMessage {
  type: 'node_status' | 'edge_status' | 'topology_update';
  payload: unknown;
}

/**
 * Hook for maintaining a WebSocket connection to the backend.
 * Handles auto-reconnect and dispatches topology update events to the store.
 */
export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setTopologyData, topologyData } = useTopoStore();

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WsMessage = JSON.parse(event.data as string);
          if (msg.type === 'topology_update' && topologyData) {
            setTopologyData(msg.payload as typeof topologyData);
          }
          if (msg.type === 'node_status' && topologyData) {
            const update = msg.payload as { id: string; status: TopoNode['status'] };
            const updatedNodes = topologyData.nodes.map((n) =>
              n.id === update.id ? { ...n, status: update.status } : n
            );
            setTopologyData({ ...topologyData, nodes: updatedNodes });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [url, setTopologyData, topologyData]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return wsRef;
}
