from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db.database import get_session
from ..models.device import Device
from ..models.link import Link
from ..models.group import Group
from ..schemas.topo import TopologyImport

router = APIRouter(prefix="/api/topology", tags=["topology"])


@router.get("/")
def get_topology(session: Session = Depends(get_session)) -> dict:
    """Return the full topology (devices, links, groups)."""
    devices = session.exec(select(Device)).all()
    links = session.exec(select(Link)).all()
    groups = session.exec(select(Group)).all()
    return {
        "nodes": [d.model_dump() for d in devices],
        "edges": [lnk.model_dump() for lnk in links],
        "groups": [g.model_dump() for g in groups],
    }


@router.post("/import")
def import_topology(
    data: TopologyImport,
    session: Session = Depends(get_session),
) -> dict:
    """Bulk-import topology data (overwrites existing data)."""
    # Clear existing records
    for model in (Device, Link, Group):
        for record in session.exec(select(model)).all():  # type: ignore[type-var]
            session.delete(record)
    session.commit()

    # Insert new records
    for node in data.nodes:
        session.add(
            Device(
                id=node.id,
                label=node.label,
                type=node.type,
                ip=node.ip,
                mac=node.mac,
                vendor=node.vendor,
                model=node.model,
                location=node.location,
                group_id=node.group,
                status=node.status,
            )
        )
    for edge in data.edges:
        session.add(
            Link(
                id=edge.id,
                source=edge.source,
                target=edge.target,
                source_port=edge.sourcePort,
                target_port=edge.targetPort,
                bandwidth=edge.bandwidth,
                utilization=edge.utilization,
                protocol=edge.protocol,
                status=edge.status,
            )
        )
    for grp in data.groups:
        session.add(
            Group(
                id=grp.id,
                label=grp.label,
                type=grp.type,
                parent_id=grp.parentId,
            )
        )

    session.commit()
    return {
        "status": "ok",
        "nodes": len(data.nodes),
        "edges": len(data.edges),
        "groups": len(data.groups),
    }


@router.get("/stats")
def get_stats(session: Session = Depends(get_session)) -> dict:
    """Return topology statistics."""
    devices = session.exec(select(Device)).all()
    links = session.exec(select(Link)).all()
    groups = session.exec(select(Group)).all()
    up_count = sum(1 for d in devices if d.status == "up")
    down_count = sum(1 for d in devices if d.status == "down")
    return {
        "total_nodes": len(devices),
        "total_edges": len(links),
        "total_groups": len(groups),
        "up": up_count,
        "down": down_count,
    }


@router.delete("/{node_id}")
def delete_device(
    node_id: str,
    session: Session = Depends(get_session),
) -> dict:
    """Delete a single device by ID."""
    device = session.get(Device, node_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    session.delete(device)
    session.commit()
    return {"status": "deleted", "id": node_id}
