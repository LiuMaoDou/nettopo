"""
把 TopologyData + 协议配置 转换为 networkx 有向加权图。

图的节点 = routerId (OSPF) 或 systemId (IS-IS)。
图的边携带属性：
  - cost / metric: int
  - edge_id: str        (原拓扑 edge id，用于前端高亮)
  - area: str           (OSPF only)
  - circuit_level: str  (IS-IS only)

cost / metric 推算优先级（每端独立）：
  1. 路由器 interfaces 列表中匹配到接口名 → 使用配置值
  2. 拓扑端点有 bandwidth → auto-cost = ceil(reference_bandwidth / bandwidth)
  3. 兜底默认值（OSPF: 10，IS-IS: default_metric）
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Optional

import networkx as nx

if TYPE_CHECKING:
    from ..schemas.routing import (
        OspfConfig,
        OspfIfaceConfig,
        IsisConfig,
        IsisIfaceConfig,
        TopologySnapshot,
        EdgeEndpointIn,
    )


# ── 辅助函数 ─────────────────────────────────────────────────────────────────

def _ospf_auto_cost(bandwidth_gbps: Optional[float], reference_gbps: float) -> int:
    if bandwidth_gbps and bandwidth_gbps > 0:
        return max(1, math.ceil(reference_gbps / bandwidth_gbps))
    return 10


def _ospf_link_area(src_areas: list[str], dst_areas: list[str]) -> str:
    common = set(src_areas) & set(dst_areas)
    if not common:
        return "0.0.0.0"
    return "0.0.0.0" if "0.0.0.0" in common else sorted(common)[0]


def _isis_auto_circuit_level(src_level: str, dst_level: str) -> str:
    can_l1 = src_level in ("L1", "L1L2") and dst_level in ("L1", "L1L2")
    can_l2 = src_level in ("L2", "L1L2") and dst_level in ("L2", "L1L2")
    if can_l1 and can_l2:
        return "L1L2"
    return "L1" if can_l1 else ("L2" if can_l2 else "L1L2")


def _lookup_iface(
    iface_list: "list[OspfIfaceConfig] | list[IsisIfaceConfig]",
    iface_name: Optional[str],
) -> "OspfIfaceConfig | IsisIfaceConfig | None":
    """在路由器的 interfaces 列表里按接口名查找配置。"""
    if not iface_name:
        return None
    for iface in iface_list:
        if iface.name == iface_name:
            return iface
    return None


# ── OSPF ─────────────────────────────────────────────────────────────────────

def build_ospf_graph(
    topo: "TopologySnapshot",
    ospf: "OspfConfig",
) -> tuple[nx.DiGraph, dict[str, str], dict[str, str]]:
    """
    构建 OSPF 有向加权图。

    cost 来源（每端独立）：
      router.interfaces[name].cost  →  拓扑 bandwidth auto-cost  →  10

    Returns:
        graph, node_name_to_router_id, edge_id_to_endpoints
    """
    node_name_to_router_id: dict[str, str] = {
        r.node_name: r.router_id for r in ospf.routers
    }
    router_cfg_map = {r.node_name: r for r in ospf.routers}
    configured_nodes = set(node_name_to_router_id)

    router_id_to_node_id: dict[str, str] = {}
    for node in topo.nodes:
        if node.node_name in node_name_to_router_id:
            rid = node_name_to_router_id[node.node_name]
            router_id_to_node_id[rid] = node.id

    G = nx.DiGraph()
    for r in ospf.routers:
        G.add_node(
            r.router_id,
            node_name=r.node_name,
            areas=r.areas,
            node_id=router_id_to_node_id.get(r.router_id, ""),
        )

    edge_id_to_endpoints: dict[str, tuple[str, str]] = {}

    for topo_edge in topo.edges:
        src_ep = topo_edge.src
        dst_ep = topo_edge.dst

        if src_ep.node_name not in configured_nodes or dst_ep.node_name not in configured_nodes:
            continue

        src_rid = node_name_to_router_id[src_ep.node_name]
        dst_rid = node_name_to_router_id[dst_ep.node_name]
        src_router = router_cfg_map[src_ep.node_name]
        dst_router = router_cfg_map[dst_ep.node_name]

        # ── src 端 cost（src → dst 方向）──────────────────────────────────────
        src_iface_cfg = _lookup_iface(src_router.interfaces, src_ep.interface)
        if src_iface_cfg:
            cost_src_to_dst = src_iface_cfg.cost
            area = src_iface_cfg.area
            network_type = src_iface_cfg.network_type
        else:
            cost_src_to_dst = _ospf_auto_cost(src_ep.bandwidth, ospf.reference_bandwidth)
            area = _ospf_link_area(src_router.areas, dst_router.areas)
            network_type = "point-to-point"

        # ── dst 端 cost（dst → src 方向）──────────────────────────────────────
        dst_iface_cfg = _lookup_iface(dst_router.interfaces, dst_ep.interface)
        if dst_iface_cfg:
            cost_dst_to_src = dst_iface_cfg.cost
        else:
            cost_dst_to_src = _ospf_auto_cost(dst_ep.bandwidth, ospf.reference_bandwidth)

        edge_id = topo_edge.id
        G.add_edge(src_rid, dst_rid, cost=cost_src_to_dst, edge_id=edge_id,
                   area=area, network_type=network_type)
        G.add_edge(dst_rid, src_rid, cost=cost_dst_to_src, edge_id=edge_id,
                   area=area, network_type=network_type)
        edge_id_to_endpoints[edge_id] = (src_rid, dst_rid)

    return G, node_name_to_router_id, edge_id_to_endpoints


# ── IS-IS ────────────────────────────────────────────────────────────────────

def build_isis_graph(
    topo: "TopologySnapshot",
    isis: "IsisConfig",
) -> tuple[nx.DiGraph, dict[str, str], dict[str, str]]:
    """
    构建 IS-IS 有向加权图。

    metric 来源（每端独立）：
      router.interfaces[name].metric  →  isis.default_metric

    circuit_level 来源：
      router.interfaces[name].circuit_level  →  从两端 level 自动推断

    Returns:
        graph, node_name_to_system_id, edge_id_to_endpoints
    """
    node_name_to_system_id: dict[str, str] = {
        r.node_name: r.system_id for r in isis.routers
    }
    router_cfg_map = {r.node_name: r for r in isis.routers}
    configured_nodes = set(node_name_to_system_id)

    system_id_to_node_id: dict[str, str] = {}
    for node in topo.nodes:
        if node.node_name in node_name_to_system_id:
            sid = node_name_to_system_id[node.node_name]
            system_id_to_node_id[sid] = node.id

    G = nx.DiGraph()
    for r in isis.routers:
        G.add_node(
            r.system_id,
            node_name=r.node_name,
            level=r.level,
            node_id=system_id_to_node_id.get(r.system_id, ""),
        )

    edge_id_to_endpoints: dict[str, tuple[str, str]] = {}

    for topo_edge in topo.edges:
        src_ep = topo_edge.src
        dst_ep = topo_edge.dst

        if src_ep.node_name not in configured_nodes or dst_ep.node_name not in configured_nodes:
            continue

        src_sid = node_name_to_system_id[src_ep.node_name]
        dst_sid = node_name_to_system_id[dst_ep.node_name]
        src_router = router_cfg_map[src_ep.node_name]
        dst_router = router_cfg_map[dst_ep.node_name]

        # ── src 端 metric ──────────────────────────────────────────────────────
        src_iface_cfg = _lookup_iface(src_router.interfaces, src_ep.interface)
        metric_src_to_dst = src_iface_cfg.metric if src_iface_cfg else isis.default_metric

        # ── dst 端 metric ──────────────────────────────────────────────────────
        dst_iface_cfg = _lookup_iface(dst_router.interfaces, dst_ep.interface)
        metric_dst_to_src = dst_iface_cfg.metric if dst_iface_cfg else isis.default_metric

        # ── circuit level：src 端配置优先，否则从两端 level 推断 ──────────────
        if src_iface_cfg and src_iface_cfg.circuit_level:
            circuit_level = src_iface_cfg.circuit_level
        elif dst_iface_cfg and dst_iface_cfg.circuit_level:
            circuit_level = dst_iface_cfg.circuit_level
        else:
            circuit_level = _isis_auto_circuit_level(src_router.level, dst_router.level)

        edge_id = topo_edge.id
        G.add_edge(src_sid, dst_sid, metric=metric_src_to_dst, edge_id=edge_id,
                   circuit_level=circuit_level)
        G.add_edge(dst_sid, src_sid, metric=metric_dst_to_src, edge_id=edge_id,
                   circuit_level=circuit_level)
        edge_id_to_endpoints[edge_id] = (src_sid, dst_sid)

    return G, node_name_to_system_id, edge_id_to_endpoints
