# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Start development (both servers concurrently)
```bash
make dev
```

### Frontend only
```bash
cd frontend && pnpm dev                    # dev server on :3000
cd frontend && pnpm build                  # tsc -b && vite build
cd frontend && pnpm lint                   # eslint
cd frontend && pnpm exec tsc --noEmit      # type-check only
```

### Backend only
```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

### Install dependencies from scratch
```bash
make install
# or manually:
cd frontend && pnpm install
cd backend && uv venv && uv pip install -r requirements.txt
```

## Architecture

### Data flow

All topology state lives in **`frontend/src/store/topoStore.ts`** (Zustand). Components read from the store and the G6 canvas reacts to store changes via `useEffect` hooks in `TopologyCanvas.tsx`.

The G6 `Graph` instance is managed by the **`useGraph`** hook (`hooks/useGraph.ts`) which owns the ref and exposes `initGraph`, `loadData`, `changeLayout`, `applySearch`, and `setPortLabelsVisible`. Because React hooks don't share state between component instances, the active graph is also registered in **`store/graphRegistry.ts`** (module-level singleton) so that other components (e.g. `Toolbar`) can access it without prop-drilling.

### Frontend structure

```
types/topo.ts           — canonical TypeScript types (TopoNode, TopoEdge, EdgeEndpoint, TopologyData)
store/topoStore.ts      — Zustand store: topologyData, currentLayout, selectedNode, searchQuery, showPortLabels
store/graphRegistry.ts  — module singleton exposing get/set for the active G6 Graph instance
hooks/useGraph.ts       — G6 lifecycle: init, loadData (setData+render), changeLayout, applySearch, setPortLabelsVisible
hooks/useWebSocket.ts   — WebSocket with auto-reconnect; patches topologyData on node_status messages
graph/PortLabelEdge.ts  — custom G6 edge extending Line; draws port+utilization labels at each endpoint
layouts/index.ts        — getLayoutConfig(LayoutType) → G6 layout config; cast to LayoutOptions at call site
utils/mockData.ts       — generateMockTopology('small'|'medium'|'large') produces 3-tier network topology
utils/dataParser.ts     — parseJSON, parseDevicesCSV, parseLinksCSV; auto-generates IDs from labels
utils/downloadTemplate.ts — downloadTemplateJSON/CSV helpers; TEMPLATE_JSONC is the canonical example topology
utils/pathfinder.ts     — BFS findShortestPath(nodes, edges, sourceId, targetId) → string[] | null
utils/exportGraph.ts    — exportToPNG/SVG/PDF wrapping graph.toDataURL
```

### Core data types (`types/topo.ts`)

```typescript
interface EdgeEndpoint {
  nodeName: string;        // required — references TopoNode.nodeName
  interface?: string;
  ipv4Address?: string; ipv4Mask?: string;
  ipv6Address?: string; ipv6Mask?: string;
  utilizationOut?: number; // 0–1, outbound from this endpoint
  bandwidth?: number;      // Gbps
  status?: 'up' | 'down';
}

interface TopoNode {
  id: string; nodeName: string;
  type?: DeviceType;   // default: 'router'
  vendor?: string; model?: string;
  group?: string;      // default: 'default' (no combo shown)
  status?: 'up' | 'down' | 'warning';
}

interface TopoEdge { id: string; src: EdgeEndpoint; dst: EdgeEndpoint; }
```

### Key G6 v5 patterns

- **Node labels**: never set `labelText: ''` in global defaults — G6 checks `!labelText` and hides all labels. Always set `labelText` per-node in `loadData()`.
- **Node stroke**: do not set `stroke` in the global node config — it overrides per-node status colors. Set it exclusively per-node in `loadData()`.
- **Node type**: use `type: 'circle'` with `icon: true` + `iconSrc`. Do not use `type: 'image'`.
- **React StrictMode**: intentionally omitted in `main.tsx`. G6 is imperative and does not survive StrictMode's double-mount in development.
- **Cross-component graph access**: `graphRegistry` (module singleton) is needed because `useGraph` creates an isolated instance per hook call — `Toolbar` and `TopologyCanvas` cannot share the ref via hooks alone.
- **Custom edge type**: `PortLabelEdge` (registered as `'port-label-edge'`) extends `Line` and overrides `drawLabelShape()` to place two extra `Label` shapes at 22% and 78% along the path using the internal `getLabelPositionStyle()` utility. Pass `startLabelText` and `endLabelText` in edge style data.
- **Element states**: `highlight`, `dim`, `selected` are set via `graph.setElementState(id, stateArray)`.
- **Layout casting**: `getLayoutConfig()` returns `Record<string, unknown>` and must be cast as `LayoutOptions` at the call site.

### Edge label layout

Each edge renders three labels:
- **22% from source**: `interface(utilizationOut%)` — e.g. `Gi0/1(71%)`; falls back to just `interface` or just `71%` if either is absent
- **Center (50%)**: bandwidth — e.g. `10G`
- **78% from source**: `interface(utilizationOut%)` for the destination endpoint

`utilizationOut` on `src` is outbound from the source node; `utilizationOut` on `dst` is outbound from the destination node (i.e. inbound at the source). Edge color reflects `Math.max(src.utilizationOut, dst.utilizationOut)`: red if either endpoint is down, orange >80%, yellow >50%, gray otherwise.

Port label visibility is toggled via `showPortLabels` in the store / `setPortLabelsVisible` in `useGraph`. Zoom-based LOD runs independently on top of this flag.

### LOD (Level of Detail) thresholds (`useGraph.ts`)

| Node count | Effect |
|---|---|
| > 300 | Suppress edge port labels (start/end) |
| > 700 | Also suppress edge center bandwidth labels |
| > 900 | Also suppress labels on leaf nodes (endpoint/server) |
| zoom < 0.5 | Hide node labels |
| zoom < 0.65 | Hide edge labels |

Combos are disabled above 500 nodes (layout breaks at scale).

### ID generation

Node IDs are auto-generated by slugifying `nodeName` (`Core-Router-1` → `core-router-1`). Edge IDs are sequential (`link-0`, `link-1`, …). Neither `id` field is required in CSV or JSON imports. In `loadData()`, a `nodeNameToId` map is built before processing edges — it keys both the raw `nodeName` and its slugified form, so sample data with sequential IDs (`node-0`) resolves correctly against human-readable endpoint names.

### Combos (grouping)

Groups are auto-derived in `loadData()` from unique non-`'default'` values of `TopoNode.group`. There is no separate groups array — just set `group` on nodes and combos appear automatically. Nodes with `group: 'default'` or no group are not assigned a combo.

### Backend structure

```
app/main.py            — FastAPI entry, CORS (localhost:3000 only), mounts routers, calls init_db() on startup
app/db/database.py     — SQLite engine (topo.db), get_session() dependency, init_db()
app/models/            — SQLModel table classes: Device, Link, Group
app/schemas/topo.py    — Pydantic input schemas: DeviceIn, LinkIn, GroupIn, TopologyImport
app/api/topology.py    — REST router at /api/topology: GET /, POST /import, GET /stats, DELETE /{id}
app/api/websocket.py   — WebSocket at /ws/topology; ConnectionManager.broadcast(dict) pushes to all clients
```

**Backend schema is out of sync with the frontend.** The backend (`DeviceIn`, `LinkIn`) still uses the old field names: `label` (not `nodeName`), `ip`, `mac`, `sourcePort`/`targetPort`, `utilization`, `protocol`, and a top-level `groups` array. The frontend's `EdgeEndpoint` structure (`src`/`dst` with nested fields) is not yet reflected in the backend. The frontend does not currently call the backend REST API — all state is client-side.

### Device icons

SVG files in `frontend/public/icons/` are served statically. `ICON_MAP` in `useGraph.ts` maps device type strings to `/icons/<type>.svg` paths used as `iconSrc` in G6 node style.

### Sample data

`data/sample-small.json` (~30 nodes) and `data/sample-medium.json` (~200 nodes) can be imported via the toolbar's "导入" button. Both files use the current edge structure: `{ id, src: { nodeName, bandwidth, status, utilizationOut }, dst: { ... } }`.
