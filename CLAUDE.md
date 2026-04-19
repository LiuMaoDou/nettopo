# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# One-click start (both servers)
make dev                                          # runs backend :8000 + frontend :3000 in parallel
bash start-linux.sh                               # Linux: opens separate terminal windows + browser
./start-mac.command                               # macOS: same via osascript

# Frontend
cd frontend && pnpm dev                           # dev server on :3000
cd frontend && pnpm exec tsc --noEmit             # type-check only (run this before committing)
cd frontend && pnpm lint
cd frontend && pnpm build

# Backend
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

# Backend tests
cd backend && .venv/bin/pytest tests/                              # all tests
cd backend && .venv/bin/pytest tests/routing/test_ospf_single_area.py -v   # single file
cd backend && .venv/bin/pytest tests/routing/test_ospf_multi_area.py -v
cd backend && .venv/bin/pytest tests/routing/test_isis_l1_l2.py -v

# Install from scratch
cd frontend && pnpm install
cd backend && uv venv && uv pip install -r requirements.txt
```

## Architecture

### Data flow

All topology state lives in **`frontend/src/store/topoStore.ts`** (Zustand). Components read from the store; the G6 canvas reacts to store changes via `useEffect` hooks in `TopologyCanvas.tsx`. No component writes to the graph directly — all graph mutations go through `useGraph.ts` callbacks, and all state transitions go through the store.

The G6 `Graph` instance is managed by the **`useGraph`** hook (`hooks/useGraph.ts`). Because each hook call creates an isolated instance, the active graph is also registered in **`store/graphRegistry.ts`** (module-level singleton) so that `Toolbar` can access it without prop-drilling.

### Routing feature end-to-end

1. User imports a topology JSON and a protocol config JSON (OSPF or IS-IS) via `Toolbar.tsx`
2. `protocolParser.ts` validates and normalises the config into `ProtocolConfig` (camelCase), which is stored in `topoStore.protocolConfig`
3. `RoutingPanel.tsx` renders when `protocolConfig` is non-null. It lets the user pick source/dest (SPT or P2P mode) and POST to `/api/routing/compute`
4. The backend (`app/api/routing.py`) calls `compute_ospf` or `compute_isis` (in `app/routing/`) using NetworkX Dijkstra, and returns `SptResultOut`
5. `RoutingPanel` stores the result in `topoStore.routingResult` + `topoStore.routingP2PHighlight`
6. `TopologyCanvas.tsx` useEffect calls `highlightRoutingResult()` in `useGraph.ts`, which applies `highlight`/`dim` element states and P2P directional arrows

Right-click on a node → context menu → "设为起点/终点" stores the node name in `topoStore.routePickSource` / `routePickDest`. A separate useEffect in `TopologyCanvas` converts those names to topo IDs and calls `setRoutePickMarkers()`, which applies `route-source` (cyan) / `route-dest` (red) states on top of any existing routing highlight state.

### Frontend structure

```
types/topo.ts           — canonical TS types: TopoNode, TopoEdge, EdgeEndpoint, TopologyData,
                          ProtocolConfig, OspfConfig, IsisConfig, RoutingResult
store/topoStore.ts      — Zustand store (all UI state; see below)
store/graphRegistry.ts  — module singleton: get/set for the active G6 Graph instance
hooks/useGraph.ts       — G6 lifecycle: initGraph, loadData, changeLayout, applySearch,
                          setPortLabelsVisible, highlightRoutingResult, setRoutePickMarkers
hooks/useWebSocket.ts   — WebSocket with auto-reconnect; patches topologyData on node_status messages
graph/PortLabelEdge.ts  — custom G6 edge (extends Line); draws port+utilization labels at 22%/78%
layouts/index.ts        — getLayoutConfig(LayoutType) → G6 layout config (cast to LayoutOptions at call site)
utils/protocolParser.ts — parseProtocolConfig(json) + validateConfigAgainstTopo(); accepts snake_case or camelCase
utils/dataParser.ts     — parseJSON, parseDevicesCSV, parseLinksCSV; auto-generates IDs from labels
utils/mockData.ts       — generateMockTopology('small'|'medium'|'large'); generateRoutingDemo()
utils/downloadTemplate.ts — downloadTemplateJSON/CSV; TEMPLATE_JSONC is the canonical topology example
utils/pathfinder.ts     — BFS findShortestPath(nodes, edges, sourceId, targetId) → string[] | null
utils/exportGraph.ts    — exportToPNG/SVG/PDF via graph.toDataURL
```

### Key store fields (`topoStore.ts`)

| Field | Purpose |
|---|---|
| `topologyData` | Loaded topology (nodes + edges) |
| `protocolConfig` | Parsed OSPF/IS-IS config; `RoutingPanel` only renders when non-null |
| `routingResult` | Latest SPF result from backend |
| `routingP2PHighlight` | `{ pathNodeTopoIds, pathEdgeIds }` — pre-resolved topo IDs for the selected A→B path |
| `routePickSource` / `routePickDest` | Node names from right-click context menu |

`clearRoutingResult()` resets both `routingResult` and `routingP2PHighlight`.

### Core data types

```typescript
interface EdgeEndpoint {
  nodeName: string;           // required — references TopoNode.nodeName
  interface?: string;
  ipv4Address?: string;
  utilizationOut?: number;    // 0–1, outbound from this endpoint
  bandwidth?: number;         // Gbps
  status?: 'up' | 'down';
}
interface TopoNode {
  id: string; nodeName: string;
  type?: DeviceType;          // default: 'router'
  group?: string;             // default: 'default' (no combo)
  status?: 'up' | 'down' | 'warning';
}
interface TopoEdge { id: string; src: EdgeEndpoint; dst: EdgeEndpoint; }
```

### Key G6 v5.1 patterns

- **Arrows**: `endArrow: boolean` (enable/disable). Style via **prefixed props**: `endArrowFill`, `endArrowStroke`, `endArrowSize`. Passing an object `{ type, fill }` directly to `endArrow` does NOT work in v5.
- **Node labels**: never set `labelText: ''` in global defaults — G6 checks `!labelText` and hides all labels. Set `labelText` per-node in `loadData()`.
- **Node stroke**: do not set `stroke` in the global node config — it overrides per-node status colors.
- **Node type**: use `type: 'circle'` with `icon: true` + `iconSrc`. Do not use `type: 'image'`.
- **React StrictMode**: intentionally omitted in `main.tsx`. G6 is imperative and does not survive double-mount.
- **Element states**: set via `graph.setElementState(id, stateArray)`. States are merged in array order — last entry wins on conflicting properties. Custom states (`route-source`, `route-dest`) are defined in the `node.state` config in `initGraph()`.
- **`updateData` vs `setElementState`**: use `updateData({ nodes/edges: [...] })` to change base style (stroke, arrows, labels). Use `setElementState` for highlight/dim/pick. Base style is overridden by active states.
- **Routing state tracking**: `nodeRoutingStateRef` in `useGraph` tracks each node's current routing state so `setRoutePickMarkers` can re-apply pick states without losing highlight/dim.

### Edge rendering

Each edge has three text labels: `interface(util%)` at 22% (src side), bandwidth at 50% (center), `interface(util%)` at 78% (dst side). All three are implemented in `PortLabelEdge.ts`. Edge color: red if either endpoint down, orange >80% util, yellow >50%, gray otherwise.

LOD thresholds (in `useGraph.ts`):

| Condition | Effect |
|---|---|
| nodeCount > 300 | Suppress edge port labels |
| nodeCount > 700 | Also suppress bandwidth labels |
| nodeCount > 900 | Also suppress labels on leaf nodes |
| zoom < 0.5 | Hide node labels |
| zoom < 0.65 | Hide edge labels |
| nodeCount > 500 | Disable combos (layout breaks at scale) |

### Backend routing

```
app/routing/graph_builder.py — builds a NetworkX DiGraph from TopologySnapshot + protocol config
app/routing/ospf.py          — compute_ospf(): Dijkstra SPF, supports multi-area (inter-area cost via ABR)
app/routing/isis.py          — compute_isis(): Dijkstra SPF, supports L1/L2/L1L2 circuit levels
app/routing/models.py        — SptResult dataclass (internal); SptResultOut Pydantic schema (HTTP response)
app/schemas/routing.py       — request/response Pydantic models; SptResultOut fields are all required
                               (dict fields must NOT have = {} defaults — FastAPI/Pydantic v2 silently drops them)
```

`path_edges[dst_rid][i]` and `path_nodes[dst_rid][i]` are parallel arrays: edge `i` connects nodes `i` and `i+1`. This ordering is relied on by the frontend to determine arrow direction.

### Backend REST / WebSocket

```
POST /api/routing/compute   — SPF computation (main routing endpoint; frontend-only state)
GET  /api/topology/         — load topology from SQLite
POST /api/topology/import   — import topology into SQLite
WS   /ws/topology           — push node_status updates to all connected clients
```

**Backend schema is out of sync with the frontend.** `app/schemas/topo.py` / `app/models/` still use old field names (`label`, `ip`, `sourcePort`, etc.). The frontend does not call the topology REST API — all state is client-side. Only `/api/routing/compute` is actively used.

### Sample and demo data (`data/`)

| File | Purpose |
|---|---|
| `sample-small.json` | ~30 nodes; import via toolbar |
| `sample-medium.json` | ~200 nodes |
| `demo-routing.json` | Topology + OSPF config combined (loads both in one import) |
| `demo-routing-ospf.json` | OSPF-only protocol config |
| `demo-routing-isis.json` | IS-IS-only protocol config |
| `sample-small-ospf.json` / `sample-small-isis.json` | Protocol configs for sample-small topology |

### ID generation

Node IDs are slugified from `nodeName` (`Core-Router-1` → `core-router-1`). `loadData()` builds a `nodeNameToId` map keyed by both raw and slugified names so sample data with sequential IDs (`node-0`) resolves correctly. Edge IDs are sequential (`link-0`, `link-1`, …). Neither field is required in import files.
