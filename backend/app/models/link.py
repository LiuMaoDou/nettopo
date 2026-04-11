from typing import Optional
from sqlmodel import SQLModel, Field


class Link(SQLModel, table=True):
    id: str = Field(primary_key=True)
    source: str
    target: str
    source_port: str = ""
    target_port: str = ""
    bandwidth: Optional[int] = None   # Mbps
    utilization: Optional[float] = None  # 0.0 – 1.0
    protocol: str = "ethernet"  # ethernet|fiber|wifi
    status: str = "up"          # up|down
