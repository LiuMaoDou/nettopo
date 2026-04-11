from typing import Optional
from sqlmodel import SQLModel, Field


class Device(SQLModel, table=True):
    id: str = Field(primary_key=True)
    label: str
    type: str = "endpoint"  # router|switch|firewall|server|ap|endpoint
    ip: str
    mac: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[str] = None
    status: str = "up"  # up|down|warning
