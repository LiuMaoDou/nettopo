from typing import Optional
from sqlmodel import SQLModel, Field


class Group(SQLModel, table=True):
    id: str = Field(primary_key=True)
    label: str
    type: str = "vlan"  # vlan|subnet|site|floor|rack
    parent_id: Optional[str] = None
