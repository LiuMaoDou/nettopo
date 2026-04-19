from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.database import init_db
from .api.topology import router as topology_router
from .api.websocket import router as ws_router
from .api.routing import router as routing_router

app = FastAPI(title="Network Topo Viz API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.include_router(topology_router)
app.include_router(ws_router)
app.include_router(routing_router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
