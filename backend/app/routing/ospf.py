"""
OSPF SPF 实现。

支持：
- 单 area（全图 Dijkstra）
- 多 area + ABR inter-area 路由（两段累加）
- cost 非对称
- ECMP（算法层返回所有等价路径，UI 层只画第一条）

不支持：stub / NSSA、外部路由（ASBR）、broadcast 伪节点。
"""

from __future__ import annotations

import networkx as nx

from ..schemas.routing import OspfConfig, TopologySnapshot
from .graph_builder import build_ospf_graph
from .models import NextHop, SptResult


def compute_ospf(
    topo: TopologySnapshot,
    ospf: OspfConfig,
    source_router_id: str,
) -> SptResult:
    """
    以 source_router_id 为根，计算整网 OSPF SPT。

    算法：
    1. 建全图 G（双向有向，edge weight = cost）
    2. 以 source 为根跑 Dijkstra → 得 intra-area cost（area 0 或同 area）
    3. 检测 ABR（参与 ≥2 个 area 的路由器）
    4. 对于非直连 area 中的路由器，通过 ABR 做 inter-area：
         cost(dst) = cost(ABR) + ABR_intra_cost(dst)
       取各 ABR 的最小值
    5. 追踪 SPT 路径，收集经过的 edge_id

    Returns:
        SptResult 包含 costs / spt_edge_ids / next_hops / node_ids
    """
    G, node_name_to_rid, _ = build_ospf_graph(topo, ospf)

    all_router_ids = {r.router_id for r in ospf.routers}

    if source_router_id not in G:
        return SptResult(
            protocol="ospf",
            source_router_id=source_router_id,
            costs={},
            next_hops={},
            spt_edge_ids=[],
            node_ids=[],
            unreachable=list(all_router_ids),
        )

    # ── 第 1 段：从 source 跑全图 Dijkstra ──────────────────────────────────
    dist, paths = nx.single_source_dijkstra(G, source_router_id, weight="cost")

    # ── ABR 检测 ────────────────────────────────────────────────────────────
    router_areas: dict[str, set[str]] = {
        r.router_id: set(r.areas) for r in ospf.routers
    }
    abrs = {rid for rid, areas in router_areas.items() if len(areas) >= 2}

    # 确定 source 所在的 area（若多个取第一个）
    source_areas = router_areas.get(source_router_id, set())

    # ── 第 2 段：inter-area 补充（ABR 为中转）─────────────────────────────
    # 对每个 ABR，计算它到其他 area 内路由器的 intra-area cost，
    # 再加上 source → ABR 的 cost，得到 source → dst 的 inter-area cost。
    for abr_rid in abrs:
        if abr_rid not in G:
            continue
        abr_areas = router_areas.get(abr_rid, set())
        remote_areas = abr_areas - source_areas
        if not remote_areas:
            continue

        # source → ABR 的 cost（从第 1 段 Dijkstra 结果取）
        cost_to_abr = dist.get(abr_rid)
        if cost_to_abr is None:
            continue

        # ABR 到 remote area 内节点的 intra-area Dijkstra
        abr_dist, abr_paths = nx.single_source_dijkstra(G, abr_rid, weight="cost")

        for dst_rid, intra_cost in abr_dist.items():
            if dst_rid == abr_rid:
                continue
            dst_areas = router_areas.get(dst_rid, set())
            # 只处理属于 remote area 的目标
            if not (dst_areas & remote_areas):
                continue

            inter_cost = cost_to_abr + intra_cost
            existing = dist.get(dst_rid)
            if existing is None or inter_cost < existing:
                # 拼接路径：source → ... → ABR → ... → dst
                dist[dst_rid] = inter_cost
                paths[dst_rid] = paths[abr_rid] + abr_paths[dst_rid][1:]

    # ── 收集 SPT edges、next_hops 和完整路径 ────────────────────────────────
    spt_edge_ids: list[str] = []
    next_hops: dict[str, NextHop] = {}
    path_edges: dict[str, list[str]] = {}   # dst_rid → [edgeId, ...]
    path_nodes: dict[str, list[str]] = {}   # dst_rid → [routerId, ...]

    for dst_rid, path in paths.items():
        if dst_rid == source_router_id or len(path) < 2:
            continue
        # next hop = path[1]
        nh_rid = path[1]
        edge_data = G.get_edge_data(source_router_id, nh_rid)
        if edge_data:
            next_hops[dst_rid] = NextHop(router_id=nh_rid, edge_id=edge_data["edge_id"])

        # 收集路径上所有 edge_id
        dst_path_edges: list[str] = []
        for i in range(len(path) - 1):
            seg_data = G.get_edge_data(path[i], path[i + 1])
            if seg_data:
                eid = seg_data["edge_id"]
                if eid not in spt_edge_ids:
                    spt_edge_ids.append(eid)
                dst_path_edges.append(eid)

        path_edges[dst_rid] = dst_path_edges
        path_nodes[dst_rid] = list(path)

    # ── 收集可达节点的 node_id 和 node_id→cost 映射 ──────────────────────────
    node_ids: list[str] = []
    node_id_to_cost: dict[str, int] = {}
    for rid, cost in dist.items():
        nid = G.nodes[rid].get("node_id", "") if rid in G else ""
        if nid:
            node_ids.append(nid)
            node_id_to_cost[nid] = int(cost)

    unreachable = [
        rid for rid in all_router_ids if rid not in dist
    ]

    costs_int: dict[str, int] = {k: int(v) for k, v in dist.items()}

    return SptResult(
        protocol="ospf",
        source_router_id=source_router_id,
        costs=costs_int,
        next_hops=next_hops,
        spt_edge_ids=spt_edge_ids,
        node_ids=node_ids,
        node_id_to_cost=node_id_to_cost,
        path_edges=path_edges,
        path_nodes=path_nodes,
        unreachable=unreachable,
    )
