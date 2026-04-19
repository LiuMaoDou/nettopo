"""
IS-IS SPF 实现。

Level 语义：
  L1  路由器：只参与 L1 域内 SPF；出 L1 域需经过 L1L2 路由器（默认路由泄露）
  L2  路由器：只参与 L2 骨干 SPF
  L1L2 路由器：同时参与 L1 域内 SPF 和 L2 骨干 SPF；做 route leaking

算法：
1. 确定 source 属于哪个级别（L1 / L2 / L1L2）
2. 按 source 级别选对应子图跑第 1 段 Dijkstra
3. 若 source 是 L1（或 L1L2 处理 L1 侧），对 L1L2 路由器做 leaking：
   L2 cost = L1_cost_to_nearest_L1L2 + L2_SPF_from_that_L1L2
4. 追踪路径，收集 edge_id
"""

from __future__ import annotations

import networkx as nx

from ..schemas.routing import IsisConfig, TopologySnapshot
from .graph_builder import build_isis_graph
from .models import NextHop, SptResult


def _subgraph_for_level(
    G: nx.DiGraph,
    allowed_levels: set[str],
) -> nx.DiGraph:
    """
    返回只包含允许 level 节点，且 circuit_level 与该 level 兼容的边的子图。
    """
    nodes = [
        n for n, d in G.nodes(data=True)
        if d.get("level", "L2") in allowed_levels
    ]
    sub = G.subgraph(nodes).copy()
    # 过滤掉不兼容 level 的边
    edges_to_remove = []
    for u, v, data in sub.edges(data=True):
        cl = data.get("circuit_level", "L1L2")
        # 边的 circuit_level 与当前 level 集合有交集才保留
        circuit_levels = {"L1", "L2", "L1L2"} if cl == "L1L2" else {cl}
        if not (circuit_levels & allowed_levels):
            edges_to_remove.append((u, v))
    sub.remove_edges_from(edges_to_remove)
    return sub


def compute_isis(
    topo: TopologySnapshot,
    isis: IsisConfig,
    source_system_id: str,
) -> SptResult:
    """
    以 source_system_id 为根，计算整网 IS-IS SPT（含 L1/L2 leaking）。
    """
    G, node_name_to_sid, _ = build_isis_graph(topo, isis)

    all_system_ids = {r.system_id for r in isis.routers}

    if source_system_id not in G:
        return SptResult(
            protocol="isis",
            source_router_id=source_system_id,
            costs={},
            next_hops={},
            spt_edge_ids=[],
            node_ids=[],
            unreachable=list(all_system_ids),
        )

    source_level = G.nodes[source_system_id].get("level", "L2")

    # L1L2 节点（做 leaking 的边界路由器）
    l1l2_nodes = {
        n for n, d in G.nodes(data=True) if d.get("level") == "L1L2"
    }

    dist: dict[str, float] = {}
    paths: dict[str, list[str]] = {}

    if source_level in ("L2", "L1L2"):
        # ── L2 骨干 SPF ──────────────────────────────────────────────────────
        l2_sub = _subgraph_for_level(G, {"L2", "L1L2"})
        if source_system_id in l2_sub:
            l2_dist, l2_paths = nx.single_source_dijkstra(
                l2_sub, source_system_id, weight="metric"
            )
            dist.update(l2_dist)
            paths.update(l2_paths)

        # ── L2 → L1 leaking：通过 L1L2 路由器进入 L1 域 ─────────────────────
        l1_sub = _subgraph_for_level(G, {"L1", "L1L2"})
        for l1l2_sid in l1l2_nodes:
            cost_to_l1l2 = dist.get(l1l2_sid)
            if cost_to_l1l2 is None:
                continue
            if l1l2_sid not in l1_sub:
                continue
            leak_dist, leak_paths = nx.single_source_dijkstra(
                l1_sub, l1l2_sid, weight="metric"
            )
            for dst_sid, l1_cost in leak_dist.items():
                if dst_sid == l1l2_sid:
                    continue
                dst_level = G.nodes[dst_sid].get("level", "L2")
                if dst_level not in ("L1",):  # 只泄露到纯 L1 节点
                    continue
                total_cost = cost_to_l1l2 + l1_cost
                if dst_sid not in dist or total_cost < dist[dst_sid]:
                    dist[dst_sid] = total_cost
                    paths[dst_sid] = paths[l1l2_sid] + leak_paths[dst_sid][1:]

    else:
        # source 是纯 L1
        # ── L1 域内 SPF ──────────────────────────────────────────────────────
        l1_sub = _subgraph_for_level(G, {"L1", "L1L2"})
        if source_system_id in l1_sub:
            l1_dist, l1_paths = nx.single_source_dijkstra(
                l1_sub, source_system_id, weight="metric"
            )
            dist.update(l1_dist)
            paths.update(l1_paths)

        # ── L1 → L2 leaking：通过最近的 L1L2 出域，再跑 L2 SPF ─────────────
        l2_sub = _subgraph_for_level(G, {"L2", "L1L2"})
        for l1l2_sid in l1l2_nodes:
            cost_to_l1l2 = dist.get(l1l2_sid)
            if cost_to_l1l2 is None:
                continue
            if l1l2_sid not in l2_sub:
                continue
            leak_dist, leak_paths = nx.single_source_dijkstra(
                l2_sub, l1l2_sid, weight="metric"
            )
            for dst_sid, l2_cost in leak_dist.items():
                if dst_sid == l1l2_sid:
                    continue
                dst_level = G.nodes[dst_sid].get("level", "L2")
                if dst_level not in ("L2",):
                    continue
                total_cost = cost_to_l1l2 + l2_cost
                if dst_sid not in dist or total_cost < dist[dst_sid]:
                    dist[dst_sid] = total_cost
                    paths[dst_sid] = paths[l1l2_sid] + leak_paths[dst_sid][1:]

    # ── 收集 SPT edges 和 next_hops ─────────────────────────────────────────
    spt_edge_ids: list[str] = []
    next_hops: dict[str, NextHop] = {}
    path_edges: dict[str, list[str]] = {}
    path_nodes: dict[str, list[str]] = {}

    for dst_sid, path in paths.items():
        if dst_sid == source_system_id or len(path) < 2:
            continue
        nh_sid = path[1]
        edge_data = G.get_edge_data(source_system_id, nh_sid)
        if edge_data:
            next_hops[dst_sid] = NextHop(router_id=nh_sid, edge_id=edge_data["edge_id"])

        dst_path_edges: list[str] = []
        for i in range(len(path) - 1):
            seg_data = G.get_edge_data(path[i], path[i + 1])
            if seg_data:
                eid = seg_data["edge_id"]
                if eid not in spt_edge_ids:
                    spt_edge_ids.append(eid)
                dst_path_edges.append(eid)

        path_edges[dst_sid] = dst_path_edges
        path_nodes[dst_sid] = list(path)

    # ── 收集 node_ids 和 node_id→cost 映射 ──────────────────────────────────
    node_ids: list[str] = []
    node_id_to_cost: dict[str, int] = {}
    for sid, cost in dist.items():
        nid = G.nodes[sid].get("node_id", "") if sid in G else ""
        if nid:
            node_ids.append(nid)
            node_id_to_cost[nid] = int(cost)

    unreachable = [sid for sid in all_system_ids if sid not in dist]
    costs_int: dict[str, int] = {k: int(v) for k, v in dist.items()}

    return SptResult(
        protocol="isis",
        source_router_id=source_system_id,
        costs=costs_int,
        next_hops=next_hops,
        spt_edge_ids=spt_edge_ids,
        node_ids=node_ids,
        node_id_to_cost=node_id_to_cost,
        path_edges=path_edges,
        path_nodes=path_nodes,
        unreachable=unreachable,
    )
