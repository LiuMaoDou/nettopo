from dataclasses import dataclass, field


@dataclass(frozen=True)
class SptEdge:
    """一条被选入 SPT 的链路（有方向：from → to）。"""

    edge_id: str
    from_router_id: str
    to_router_id: str
    cost: int  # 这段链路的单跳 cost


@dataclass(frozen=True)
class NextHop:
    router_id: str
    edge_id: str


@dataclass
class SptResult:
    """SPF 计算结果。"""

    protocol: str                             # "ospf" | "isis"
    source_router_id: str
    costs: dict[str, int]                     # router_id → 累计 cost
    next_hops: dict[str, NextHop]             # router_id → 下一跳
    spt_edge_ids: list[str]                   # 被选入 SPT 的 edge id 列表（前端高亮用）
    node_ids: list[str]                       # 可达节点的拓扑 node id 列表
    node_id_to_cost: dict[str, int] = field(default_factory=dict)  # topo node_id → 累计 cost
    path_edges: dict[str, list[str]] = field(default_factory=dict)  # router_id → [edgeId, ...] 从 source 到该节点的完整 edge 路径
    path_nodes: dict[str, list[str]] = field(default_factory=dict)  # router_id → [routerId, ...] 从 source 到该节点的完整 router 路径
    unreachable: list[str] = field(default_factory=list)  # 不可达 router_id
