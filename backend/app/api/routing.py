from fastapi import APIRouter, HTTPException

from ..routing import compute_ospf, compute_isis
from ..routing.models import SptResult
from ..schemas.routing import RoutingComputeRequest, SptResultOut, NextHopOut

router = APIRouter(prefix="/api/routing", tags=["routing"])


def _serialize(result: SptResult) -> SptResultOut:
    return SptResultOut(
        protocol=result.protocol,
        source_router_id=result.source_router_id,
        costs=result.costs,
        next_hops={
            k: NextHopOut(router_id=v.router_id, edge_id=v.edge_id)
            for k, v in result.next_hops.items()
        },
        spt_edge_ids=result.spt_edge_ids,
        node_ids=result.node_ids,
        node_id_to_cost=result.node_id_to_cost,
        path_edges=result.path_edges,
        path_nodes=result.path_nodes,
        unreachable=result.unreachable,
    )


@router.post("/compute", response_model=SptResultOut)
def compute_routing(req: RoutingComputeRequest) -> SptResultOut:
    if req.protocol == "ospf":
        if req.ospf_config is None:
            raise HTTPException(status_code=422, detail="ospf_config is required for OSPF")
        result = compute_ospf(req.topology, req.ospf_config, req.source_router_id)
    else:
        if req.isis_config is None:
            raise HTTPException(status_code=422, detail="isis_config is required for IS-IS")
        result = compute_isis(req.topology, req.isis_config, req.source_router_id)

    return _serialize(result)
