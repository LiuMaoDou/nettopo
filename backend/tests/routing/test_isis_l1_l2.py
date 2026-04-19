"""
IS-IS L1/L2 测试。

拓扑（接口名已标注）：
  L1 域:  R1(L1)[Gi0/0] --[metric 10]--> R2(L1L2)[Gi0/0]
  L2 骨干: R2(L1L2)[Gi0/1] --[metric 20]--> R3(L2)[Gi0/0]

从 R1 出发（纯 L1）：
  - R2: cost 10  (L1 域内)
  - R3: cost 30  (leaking: 10 to L1L2 + 20 L2 SPF)

从 R3 出发（纯 L2）：
  - R2: cost 20  (L2 骨干)
  - R1: cost 30  (leaking: 20 to L1L2 + 10 L1 SPF)
"""

from app.routing.isis import compute_isis
from app.schemas.routing import (
    IsisConfig,
    IsisIfaceConfig,
    IsisRouterConfig,
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


def make_isis() -> IsisConfig:
    return IsisConfig(
        routers=[
            IsisRouterConfig(
                node_name="R1", system_id="0000.0000.0001", level="L1",
                interfaces=[
                    IsisIfaceConfig(name="Gi0/0", metric=10, circuit_level="L1"),
                ],
            ),
            IsisRouterConfig(
                node_name="R2", system_id="0000.0000.0002", level="L1L2",
                interfaces=[
                    IsisIfaceConfig(name="Gi0/0", metric=10, circuit_level="L1"),
                    IsisIfaceConfig(name="Gi0/1", metric=20, circuit_level="L2"),
                ],
            ),
            IsisRouterConfig(
                node_name="R3", system_id="0000.0000.0003", level="L2",
                interfaces=[
                    IsisIfaceConfig(name="Gi0/0", metric=20, circuit_level="L2"),
                ],
            ),
        ],
    )


def test_l1_source_costs() -> None:
    """从纯 L1 节点 R1 出发，通过 leaking 到达 L2 节点 R3。"""
    result = compute_isis(make_topo(), make_isis(), "0000.0000.0001")
    assert result.costs["0000.0000.0001"] == 0
    assert result.costs["0000.0000.0002"] == 10   # L1 域内
    assert result.costs["0000.0000.0003"] == 30   # leaking: 10 + 20


def test_l2_source_costs() -> None:
    """从纯 L2 节点 R3 出发，通过 leaking 到达 L1 节点 R1。"""
    result = compute_isis(make_topo(), make_isis(), "0000.0000.0003")
    assert result.costs["0000.0000.0003"] == 0
    assert result.costs["0000.0000.0002"] == 20   # L2 骨干（R3 的 Gi0/0 出方向 metric=20）
    assert result.costs["0000.0000.0001"] == 30   # leaking: 20 + 10


def test_l1l2_source_covers_all() -> None:
    """从 L1L2 节点 R2 出发，应能到达 L1 和 L2 两侧。"""
    result = compute_isis(make_topo(), make_isis(), "0000.0000.0002")
    assert result.costs["0000.0000.0001"] == 10
    assert result.costs["0000.0000.0003"] == 20
    assert result.unreachable == []


def test_l1_source_spt_edges() -> None:
    result = compute_isis(make_topo(), make_isis(), "0000.0000.0001")
    assert "link-0" in result.spt_edge_ids
    assert "link-1" in result.spt_edge_ids


def test_invalid_source() -> None:
    result = compute_isis(make_topo(), make_isis(), "9999.9999.9999")
    assert result.spt_edge_ids == []
    assert result.costs == {}
