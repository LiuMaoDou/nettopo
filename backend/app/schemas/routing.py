"""
协议配置 + 拓扑快照的 Pydantic schema，用于 /api/routing/compute 请求体。
"""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, field_validator


# ─── 拓扑快照（前端传来，镜像前端类型）────────────────────────────────────────

class EdgeEndpointIn(BaseModel):
    node_name: str
    interface: Optional[str] = None
    ipv4_address: Optional[str] = None
    bandwidth: Optional[float] = None
    utilization_out: Optional[float] = None
    status: Optional[str] = None

    model_config = {"populate_by_name": True}


class TopoEdgeIn(BaseModel):
    id: str
    src: EdgeEndpointIn
    dst: EdgeEndpointIn


class TopoNodeIn(BaseModel):
    id: str
    node_name: str
    type: Optional[str] = None
    group: Optional[str] = None
    status: Optional[str] = None


class TopologySnapshot(BaseModel):
    nodes: list[TopoNodeIn]
    edges: list[TopoEdgeIn]


# ─── OSPF 配置 ────────────────────────────────────────────────────────────────

IsisLevel = Literal["L1", "L2", "L1L2"]


class OspfIfaceConfig(BaseModel):
    """单台路由器上一个接口的 OSPF 配置。"""
    name: str                                                    # 接口名，对应拓扑 EdgeEndpoint.interface
    cost: int = 10                                               # 出方向 OSPF cost
    area: str = "0.0.0.0"
    network_type: Literal["point-to-point", "broadcast"] = "point-to-point"
    passive: bool = False

    @field_validator("cost")
    @classmethod
    def cost_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("OSPF cost must be positive")
        return v


class OspfRouterConfig(BaseModel):
    node_name: str
    router_id: str
    areas: list[str] = ["0.0.0.0"]
    interfaces: list[OspfIfaceConfig] = []   # 显式配置的接口；未列出的接口从带宽自动推算

    @field_validator("router_id")
    @classmethod
    def validate_router_id(cls, v: str) -> str:
        parts = v.split(".")
        if len(parts) != 4 or not all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
            raise ValueError(f"Invalid router ID format: {v!r} (expected dotted-decimal)")
        return v


class OspfConfig(BaseModel):
    protocol: Literal["ospf"] = "ospf"
    routers: list[OspfRouterConfig]
    reference_bandwidth: float = 100.0   # Gbps；auto-cost = ceil(ref / linkBandwidth)


# ─── IS-IS 配置 ───────────────────────────────────────────────────────────────

class IsisIfaceConfig(BaseModel):
    """单台路由器上一个接口的 IS-IS 配置。"""
    name: str                            # 接口名
    metric: int = 10                     # 出方向 IS-IS metric
    circuit_level: Optional[IsisLevel] = None  # None = 从两端路由器 level 自动推断

    @field_validator("metric")
    @classmethod
    def metric_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("IS-IS metric must be positive")
        return v


class IsisRouterConfig(BaseModel):
    node_name: str
    system_id: str
    level: IsisLevel = "L2"
    interfaces: list[IsisIfaceConfig] = []   # 显式配置的接口


class IsisConfig(BaseModel):
    protocol: Literal["isis"] = "isis"
    routers: list[IsisRouterConfig]
    default_metric: int = 10             # 未显式配置的接口使用此 metric


# ─── 请求体 ───────────────────────────────────────────────────────────────────

class RoutingComputeRequest(BaseModel):
    topology: TopologySnapshot
    ospf_config: Optional[OspfConfig] = None
    isis_config: Optional[IsisConfig] = None
    protocol: Literal["ospf", "isis"]
    source_router_id: str  # routerId (OSPF) or systemId (IS-IS)


# ─── 响应体 ───────────────────────────────────────────────────────────────────

class NextHopOut(BaseModel):
    router_id: str
    edge_id: str


class SptResultOut(BaseModel):
    protocol: str
    source_router_id: str
    costs: dict[str, int]
    next_hops: dict[str, NextHopOut]
    spt_edge_ids: list[str]
    node_ids: list[str]
    node_id_to_cost: dict[str, int]
    path_edges: dict[str, list[str]]   # routerId → [edgeId, ...]
    path_nodes: dict[str, list[str]]   # routerId → [routerId, ...]
    unreachable: list[str]
