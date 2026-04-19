"""
OSPF 单 area 测试：三角拓扑，非对称 cost，验证 SPT 和 cost 累计。

拓扑（接口名已标注）：
  R1[Gi0/0] ---> R2[Gi0/0]   R1 出方向 cost=10，R2 出方向 cost=20
  R2[Gi0/1] ---> R3[Gi0/0]   两端 cost=5
  R1[Gi0/1] ---> R3[Gi0/1]   两端 cost=100（高 cost 直连）

从 R1 出发：
  - R1→R2: cost 10  (next hop: R2, edge: link-0)
  - R1→R3: cost 15  (via R2: 10+5)，而不是直连 100
"""

import pytest
from app.routing.ospf import compute_ospf
from app.schemas.routing import (
    OspfConfig,
    OspfIfaceConfig,
    OspfRouterConfig,
    TopologySnapshot,
    TopoNodeIn,
    TopoEdgeIn,
    EdgeEndpointIn,
)


def make_topo() -> TopologySnapshot:
    return TopologySnapshot(
        nodes=[
            TopoNodeIn(id="r1", node_name="R1"),
            TopoNodeIn(id="r2", node_name="R2"),
            TopoNodeIn(id="r3", node_name="R3"),
        ],
        edges=[
            TopoEdgeIn(
                id="link-0",
                src=EdgeEndpointIn(node_name="R1", interface="Gi0/0"),
                dst=EdgeEndpointIn(node_name="R2", interface="Gi0/0"),
            ),
            TopoEdgeIn(
                id="link-1",
                src=EdgeEndpointIn(node_name="R2", interface="Gi0/1"),
                dst=EdgeEndpointIn(node_name="R3", interface="Gi0/0"),
            ),
            TopoEdgeIn(
                id="link-2",
                src=EdgeEndpointIn(node_name="R1", interface="Gi0/1"),
                dst=EdgeEndpointIn(node_name="R3", interface="Gi0/1"),
            ),
        ],
    )


def make_ospf() -> OspfConfig:
    return OspfConfig(
        routers=[
            OspfRouterConfig(
                node_name="R1", router_id="1.1.1.1", areas=["0.0.0.0"],
                interfaces=[
                    OspfIfaceConfig(name="Gi0/0", cost=10, area="0.0.0.0"),
                    OspfIfaceConfig(name="Gi0/1", cost=100, area="0.0.0.0"),
                ],
            ),
            OspfRouterConfig(
                node_name="R2", router_id="2.2.2.2", areas=["0.0.0.0"],
                interfaces=[
                    OspfIfaceConfig(name="Gi0/0", cost=20, area="0.0.0.0"),
                    OspfIfaceConfig(name="Gi0/1", cost=5,  area="0.0.0.0"),
                ],
            ),
            OspfRouterConfig(
                node_name="R3", router_id="3.3.3.3", areas=["0.0.0.0"],
                interfaces=[
                    OspfIfaceConfig(name="Gi0/0", cost=5,   area="0.0.0.0"),
                    OspfIfaceConfig(name="Gi0/1", cost=100,  area="0.0.0.0"),
                ],
            ),
        ],
    )


def test_costs_from_r1() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "1.1.1.1")
    assert result.costs["1.1.1.1"] == 0
    assert result.costs["2.2.2.2"] == 10
    # via R2: 10 + 5 = 15，比直连 100 优
    assert result.costs["3.3.3.3"] == 15


def test_spt_edges_from_r1() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "1.1.1.1")
    assert "link-0" in result.spt_edge_ids
    assert "link-1" in result.spt_edge_ids
    assert "link-2" not in result.spt_edge_ids


def test_next_hops_from_r1() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "1.1.1.1")
    assert result.next_hops["2.2.2.2"].router_id == "2.2.2.2"
    assert result.next_hops["2.2.2.2"].edge_id == "link-0"
    assert result.next_hops["3.3.3.3"].router_id == "2.2.2.2"


def test_node_ids_populated() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "1.1.1.1")
    assert set(result.node_ids) == {"r1", "r2", "r3"}


def test_costs_from_r2_asymmetric() -> None:
    """从 R2 出发验证非对称 cost：R2[Gi0/0] 出方向 cost=20 到 R1。"""
    result = compute_ospf(make_topo(), make_ospf(), "2.2.2.2")
    assert result.costs["2.2.2.2"] == 0
    assert result.costs["1.1.1.1"] == 20   # R2 的 Gi0/0 出方向 cost
    assert result.costs["3.3.3.3"] == 5


def test_invalid_source() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "9.9.9.9")
    assert result.spt_edge_ids == []
    assert result.costs == {}
    assert set(result.unreachable) == {"1.1.1.1", "2.2.2.2", "3.3.3.3"}
