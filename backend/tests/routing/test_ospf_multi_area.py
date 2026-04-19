"""
OSPF 多 area + ABR 测试。

拓扑（接口名已标注）：
  Area 0.0.0.0:  R1[Gi0/0] --[cost 10]--> R2(ABR)[Gi0/0]
  Area 0.0.0.1:  R2(ABR)[Gi0/1] --[cost 20]--> R3[Gi0/0]

R2 是 ABR（参与两个 area）。
从 R1 出发：
  - R2: cost 10  (intra area 0)
  - R3: cost 30  (inter-area: 10 到 ABR + 20 到 R3)
"""

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
        ],
    )


def make_ospf() -> OspfConfig:
    return OspfConfig(
        routers=[
            OspfRouterConfig(
                node_name="R1", router_id="1.1.1.1", areas=["0.0.0.0"],
                interfaces=[
                    OspfIfaceConfig(name="Gi0/0", cost=10, area="0.0.0.0"),
                ],
            ),
            OspfRouterConfig(
                node_name="R2", router_id="2.2.2.2", areas=["0.0.0.0", "0.0.0.1"],
                interfaces=[
                    OspfIfaceConfig(name="Gi0/0", cost=10, area="0.0.0.0"),
                    OspfIfaceConfig(name="Gi0/1", cost=20, area="0.0.0.1"),
                ],
            ),
            OspfRouterConfig(
                node_name="R3", router_id="3.3.3.3", areas=["0.0.0.1"],
                interfaces=[
                    OspfIfaceConfig(name="Gi0/0", cost=20, area="0.0.0.1"),
                ],
            ),
        ],
    )


def test_inter_area_cost() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "1.1.1.1")
    assert result.costs["1.1.1.1"] == 0
    assert result.costs["2.2.2.2"] == 10
    assert result.costs["3.3.3.3"] == 30  # 10 (to ABR) + 20 (ABR to R3)


def test_inter_area_spt_edges() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "1.1.1.1")
    assert "link-0" in result.spt_edge_ids
    assert "link-1" in result.spt_edge_ids


def test_inter_area_next_hop_r3() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "1.1.1.1")
    assert result.next_hops["3.3.3.3"].router_id == "2.2.2.2"


def test_all_reachable() -> None:
    result = compute_ospf(make_topo(), make_ospf(), "1.1.1.1")
    assert result.unreachable == []
    assert set(result.node_ids) == {"r1", "r2", "r3"}
