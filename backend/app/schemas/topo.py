from typing import Optional, List
from pydantic import BaseModel


class DeviceIn(BaseModel):
    id: str
    label: str
    type: str = "endpoint"
    ip: str
    mac: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    group: Optional[str] = None
    status: str = "up"


class LinkIn(BaseModel):
    id: str
    source: str
    target: str
    sourcePort: str = ""
    targetPort: str = ""
    bandwidth: Optional[int] = None
    utilization: Optional[float] = None
    protocol: str = "ethernet"
    status: str = "up"


class GroupIn(BaseModel):
    id: str
    label: str
    type: str = "vlan"
    parentId: Optional[str] = None


class TopologyImport(BaseModel):
    nodes: List[DeviceIn]
    edges: List[LinkIn]
    groups: List[GroupIn] = []
