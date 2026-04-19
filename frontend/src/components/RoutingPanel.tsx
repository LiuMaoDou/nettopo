/**
 * RoutingPanel — 协议路径面板。
 *
 * 两种模式：
 *   SPT 模式    — 选源路由器，高亮从它出发的完整最短路径树
 *   点到点模式  — 选 A 和 B，只高亮 A→B 最短路径
 */

import { useState, useEffect, useCallback } from 'react';
import { useTopoStore } from '../store/topoStore';
import type { OspfConfig, IsisConfig } from '../types/topo';

const API_BASE = 'http://localhost:8000';

function buildRequestBody(
  topologyData: ReturnType<typeof useTopoStore.getState>['topologyData'],
  protocolConfig: ReturnType<typeof useTopoStore.getState>['protocolConfig'],
  protocol: 'ospf' | 'isis',
  sourceRouterId: string,
) {
  const topology = {
    nodes: (topologyData?.nodes ?? []).map((n) => ({
      id: n.id, node_name: n.nodeName, type: n.type, group: n.group, status: n.status,
    })),
    edges: (topologyData?.edges ?? []).map((e) => ({
      id: e.id,
      src: { node_name: e.src.nodeName, interface: e.src.interface, bandwidth: e.src.bandwidth, utilization_out: e.src.utilizationOut, status: e.src.status },
      dst: { node_name: e.dst.nodeName, interface: e.dst.interface, bandwidth: e.dst.bandwidth, utilization_out: e.dst.utilizationOut, status: e.dst.status },
    })),
  };
  return {
    topology,
    ospf_config: protocol === 'ospf' && protocolConfig?.ospf ? buildOspfPayload(protocolConfig.ospf) : null,
    isis_config: protocol === 'isis' && protocolConfig?.isis ? buildIsisPayload(protocolConfig.isis) : null,
    protocol,
    source_router_id: sourceRouterId,
  };
}

function buildOspfPayload(ospf: OspfConfig) {
  return {
    protocol: 'ospf',
    routers: ospf.routers.map((r) => ({ node_name: r.nodeName, router_id: r.routerId, areas: r.areas })),
    interfaces: ospf.interfaces.map((i) => ({ edge_id: i.edgeId, src_cost: i.srcCost, dst_cost: i.dstCost, area: i.area, network_type: i.networkType ?? 'point-to-point', passive: i.passive ?? false })),
  };
}

function buildIsisPayload(isis: IsisConfig) {
  return {
    protocol: 'isis',
    routers: isis.routers.map((r) => ({ node_name: r.nodeName, system_id: r.systemId, level: r.level })),
    interfaces: isis.interfaces.map((i) => ({ edge_id: i.edgeId, src_metric: i.srcMetric, dst_metric: i.dstMetric, circuit_level: i.circuitLevel })),
  };
}

type ViewMode = 'spt' | 'p2p';

export default function RoutingPanel() {
  const {
    protocolConfig, topologyData, routingResult,
    setRoutingResult, setRoutingP2PHighlight, clearRoutingResult,
    routePickSource, routePickDest,
  } = useTopoStore();

  const [protocol, setProtocol] = useState<'ospf' | 'isis'>('ospf');
  const [viewMode, setViewMode] = useState<ViewMode>('spt');
  const [sourceRouterId, setSourceRouterId] = useState('');
  const [destRouterId, setDestRouterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (protocolConfig?.ospf) setProtocol('ospf');
    else if (protocolConfig?.isis) setProtocol('isis');
  }, [protocolConfig]);

  const routerList =
    protocol === 'ospf'
      ? (protocolConfig?.ospf?.routers ?? []).map((r) => ({ id: r.routerId, label: `${r.nodeName} (${r.routerId})`, nodeName: r.nodeName }))
      : (protocolConfig?.isis?.routers ?? []).map((r) => ({ id: r.systemId, label: `${r.nodeName} (${r.systemId})`, nodeName: r.nodeName }));

  useEffect(() => {
    setSourceRouterId(routerList[0]?.id ?? '');
    setDestRouterId(routerList[1]?.id ?? '');
    setError(null);
    clearRoutingResult();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol, protocolConfig]);

  // 当 sourceRouterId 与 destRouterId 相同时自动换终点，避免"无路径"
  useEffect(() => {
    if (!sourceRouterId || sourceRouterId !== destRouterId) return;
    const newDest = routerList.find((r) => r.id !== sourceRouterId);
    if (newDest) setDestRouterId(newDest.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceRouterId]);

  // 右键标记起点 A → 同步到 sourceRouterId，并切换到点到点模式
  useEffect(() => {
    if (!routePickSource) return;
    const router = routerList.find((r) => r.nodeName === routePickSource);
    if (!router) return;
    setViewMode('p2p');
    setOpen(true);
    setSourceRouterId(router.id);
    clearRoutingResult();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePickSource]);

  // 右键标记终点 B → 同步到 destRouterId，并切换到点到点模式
  useEffect(() => {
    if (!routePickDest) return;
    const router = routerList.find((r) => r.nodeName === routePickDest);
    if (!router) return;
    setViewMode('p2p');
    setOpen(true);
    setDestRouterId(router.id);
    clearRoutingResult();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePickDest]);

  /** 根据 routerId 列表和当前 protocolConfig/topologyData 构建 P2P 高亮信息 */
  const buildP2PHighlight = useCallback((
    dstId: string,
    result: typeof routingResult,
  ) => {
    if (!result || !topologyData || !protocolConfig) return null;
    const pathEdgeIds = result.pathEdges[dstId] ?? [];
    const pathRouterIds: string[] = result.pathNodes[dstId] ?? [];

    const ridToNodeId: Record<string, string> = {};
    if (protocol === 'ospf') {
      protocolConfig.ospf?.routers.forEach((r) => {
        const node = topologyData.nodes.find((n) => n.nodeName === r.nodeName);
        if (node) ridToNodeId[r.routerId] = node.id;
      });
    } else {
      protocolConfig.isis?.routers.forEach((r) => {
        const node = topologyData.nodes.find((n) => n.nodeName === r.nodeName);
        if (node) ridToNodeId[r.systemId] = node.id;
      });
    }

    const pathNodeTopoIds = pathRouterIds.map((rid) => ridToNodeId[rid]).filter(Boolean);
    return { pathNodeTopoIds, pathEdgeIds };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyData, protocolConfig, protocol]);

  // 点到点模式下，目标切换时更新 P2P 高亮（无需重新计算）
  useEffect(() => {
    if (viewMode !== 'p2p' || !routingResult || !destRouterId || !topologyData) return;
    setRoutingP2PHighlight(buildP2PHighlight(destRouterId, routingResult));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destRouterId, viewMode]);

  if (!protocolConfig) return null;

  const handleCompute = async () => {
    if (!sourceRouterId || !topologyData) return;
    setLoading(true);
    setError(null);
    try {
      const body = buildRequestBody(topologyData, protocolConfig, protocol, sourceRouterId);
      const resp = await fetch(`${API_BASE}/api/routing/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      const result = {
        protocol: data.protocol,
        sourceRouterId: data.source_router_id,
        costs: data.costs,
        nextHops: Object.fromEntries(
          Object.entries(data.next_hops ?? {}).map(([k, v]) => [k, { routerId: (v as { router_id: string; edge_id: string }).router_id, edgeId: (v as { router_id: string; edge_id: string }).edge_id }]),
        ),
        sptEdgeIds: data.spt_edge_ids,
        nodeIds: data.node_ids,
        nodeIdToCost: data.node_id_to_cost ?? {},
        pathEdges: data.path_edges ?? {},
        pathNodes: data.path_nodes ?? {},
        unreachable: data.unreachable,
      };

      // P2P 模式：通过 store 设置高亮路径，TopologyCanvas effect 统一处理渲染
      if (viewMode === 'p2p' && destRouterId) {
        setRoutingP2PHighlight(buildP2PHighlight(destRouterId, result));
      } else {
        setRoutingP2PHighlight(null);
      }
      setRoutingResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => clearRoutingResult();

  const hasResult = routingResult !== null;

  // 当前点到点路径的 cost
  const p2pCost = (viewMode === 'p2p' && hasResult && destRouterId)
    ? (routingResult.costs[destRouterId] ?? null)
    : null;

  const srcLabel = routerList.find((r) => r.id === sourceRouterId)?.nodeName ?? sourceRouterId;
  const dstLabel = routerList.find((r) => r.id === destRouterId)?.nodeName ?? destRouterId;

  return (
    <div className="absolute left-4 bottom-12 z-10 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl text-white text-sm overflow-hidden">
      {/* 标题栏 */}
      <div
        className="flex justify-between items-center px-4 py-2.5 bg-gray-800 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-medium">协议路径</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? '' : 'rotate-180'}`} viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polyline points="1,1 5,5 9,1" />
        </svg>
      </div>

      {open && (
        <div className="p-4 space-y-3">
          {/* 协议切换 */}
          <div className="flex gap-2">
            {(['ospf', 'isis'] as const).map((p) => {
              const available = p === 'ospf' ? !!protocolConfig.ospf : !!protocolConfig.isis;
              return (
                <button key={p} disabled={!available} onClick={() => setProtocol(p)}
                  className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                    protocol === p && available ? 'bg-indigo-600 text-white'
                    : available ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              );
            })}
          </div>

          {/* 模式切换 */}
          <div className="flex rounded overflow-hidden border border-gray-700 text-xs">
            {(['spt', 'p2p'] as const).map((m) => (
              <button key={m} onClick={() => { setViewMode(m); clearRoutingResult(); }}
                className={`flex-1 py-1 transition-colors ${
                  viewMode === m ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {m === 'spt' ? '最短路径树' : '点到点'}
              </button>
            ))}
          </div>

          {/* 源路由器 */}
          <div>
            <label className="block text-gray-400 text-xs mb-1">{viewMode === 'p2p' ? '起点 A' : '源路由器'}</label>
            <select value={sourceRouterId} onChange={(e) => { setSourceRouterId(e.target.value); clearRoutingResult(); }}
              className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-xs"
            >
              {routerList.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          {/* 目标路由器（仅点到点模式） */}
          {viewMode === 'p2p' && (
            <div>
              <label className="block text-gray-400 text-xs mb-1">终点 B</label>
              <select value={destRouterId} onChange={(e) => setDestRouterId(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-xs"
              >
                {routerList.filter((r) => r.id !== sourceRouterId).map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button onClick={handleCompute} disabled={loading || !sourceRouterId}
              className="flex-1 py-1.5 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '计算中...' : viewMode === 'p2p' ? '计算路径' : '计算 SPT'}
            </button>
            {hasResult && (
              <button onClick={handleClear} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-xs hover:bg-gray-600 transition-colors">
                清除
              </button>
            )}
          </div>

          {/* 错误 */}
          {error && (
            <div className="text-red-400 text-xs bg-red-950 border border-red-800 rounded px-3 py-2">{error}</div>
          )}

          {/* 点到点结果 */}
          {hasResult && routingResult && viewMode === 'p2p' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-amber-400 font-medium">{srcLabel}</span>
                <span className="text-gray-500">→</span>
                <span className="text-amber-400 font-medium">{dstLabel}</span>
                {p2pCost !== null && (
                  <span className="ml-auto text-gray-400">cost <span className="text-white font-mono">{p2pCost}</span></span>
                )}
              </div>
              {/* 路径节点序列 */}
              {(() => {
                const pathRids = routingResult.pathNodes[destRouterId] ?? [];
                if (!pathRids.length) return <div className="text-xs text-red-400">无路径</div>;
                return (
                  <div className="flex flex-wrap items-center gap-1 text-xs font-mono bg-gray-800 rounded px-2 py-1.5">
                    {pathRids.map((rid, i) => {
                      const name = routerList.find((r) => r.id === rid)?.nodeName ?? rid;
                      return (
                        <span key={i} className="flex items-center gap-1">
                          <span className={i === 0 || i === pathRids.length - 1 ? 'text-amber-400' : 'text-white'}>{name}</span>
                          {i < pathRids.length - 1 && <span className="text-gray-500">→</span>}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
              {/* 切换终点可以看其他路径 */}
              <div className="text-gray-500 text-xs">切换终点 B 可查看其他路径</div>
            </div>
          )}

          {/* SPT 结果表格 */}
          {hasResult && routingResult && viewMode === 'spt' && (
            <div className="space-y-2">
              <div className="text-gray-400 text-xs">{protocol.toUpperCase()} SPT — 源: {routingResult.sourceRouterId}</div>
              <div className="max-h-48 overflow-y-auto rounded border border-gray-700">
                <table className="w-full text-xs">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left text-gray-400 font-normal">Router ID</th>
                      <th className="px-2 py-1 text-right text-gray-400 font-normal">Cost</th>
                      <th className="px-2 py-1 text-left text-gray-400 font-normal">Next Hop</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(routingResult.costs).sort(([, a], [, b]) => a - b).map(([rid, cost]) => {
                      const nh = routingResult.nextHops[rid];
                      const name = routerList.find((r) => r.id === rid)?.nodeName ?? rid;
                      const nhName = nh ? (routerList.find((r) => r.id === nh.routerId)?.nodeName ?? nh.routerId) : '—';
                      return (
                        <tr key={rid} className="border-t border-gray-800 hover:bg-gray-800/50">
                          <td className="px-2 py-1">{name}</td>
                          <td className="px-2 py-1 text-right text-amber-400 font-mono">{cost}</td>
                          <td className="px-2 py-1 text-gray-400">{nhName}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {routingResult.unreachable.length > 0 && (
                <div className="text-xs text-red-400">不可达: {routingResult.unreachable.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
