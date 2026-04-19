import type { TopologyData, TopoNode, TopoEdge, DeviceType, ProtocolConfig } from '../types/topo';

/**
 * 生成三层网络拓扑模拟数据
 * @param scale 'small' | 'medium' | 'large'
 *   small:  ~20 设备
 *   medium: ~200 设备
 *   large:  ~1500 设备
 */
export function generateMockTopology(
  scale: 'small' | 'medium' | 'large' = 'medium'
): TopologyData {
  const config = {
    small:  { coreCount: 2, distCount: 4,  accessPerDist: 2,  endpointsPerAccess: 2  },
    medium: { coreCount: 2, distCount: 8,  accessPerDist: 4,  endpointsPerAccess: 5  },
    large:  { coreCount: 4, distCount: 16, accessPerDist: 8,  endpointsPerAccess: 10 },
  };
  const c = config[scale];
  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];
  let nodeIdx = 0;
  let edgeIdx = 0;

  // --- Helper ---
  const makeNode = (type: DeviceType, nodeName: string, group: string): TopoNode => ({
    id: `node-${nodeIdx++}`,
    nodeName,
    type,
    status: Math.random() > 0.05 ? 'up' : 'down',
    group,
  });

  const makeEdge = (src: TopoNode, dst: TopoNode, bw: number, util?: number): TopoEdge => ({
    id: `edge-${edgeIdx++}`,
    src: {
      nodeName: src.nodeName,
      bandwidth: bw,
      utilizationOut: util ?? parseFloat((Math.random() * 0.6).toFixed(2)),
      status: src.status === 'down' || dst.status === 'down' ? 'down' : 'up',
    },
    dst: {
      nodeName: dst.nodeName,
      bandwidth: bw,
      utilizationOut: util ?? parseFloat((Math.random() * 0.6).toFixed(2)),
      status: src.status === 'down' || dst.status === 'down' ? 'down' : 'up',
    },
  });

  // --- Core layer ---
  const cores: TopoNode[] = [];
  for (let i = 1; i <= c.coreCount; i++) {
    cores.push(makeNode('router', `Core-${i}`, 'Core'));
  }
  nodes.push(...cores);

  // Core mesh
  for (let i = 0; i < cores.length; i++) {
    for (let j = i + 1; j < cores.length; j++) {
      edges.push(makeEdge(cores[i], cores[j], 100, parseFloat((Math.random() * 0.4).toFixed(2))));
    }
  }

  // --- Distribution layer ---
  const dists: TopoNode[] = [];
  for (let i = 1; i <= c.distCount; i++) {
    dists.push(makeNode('switch', `Dist-SW-${i}`, `Dist-${Math.ceil(i / 2)}`));
  }
  nodes.push(...dists);

  // Each dist connects to all cores
  dists.forEach((dist) => {
    cores.forEach((core) => {
      edges.push(makeEdge(dist, core, 10, parseFloat((Math.random() * 0.5).toFixed(2))));
    });
  });

  // --- Access layer ---
  const accesses: TopoNode[] = [];
  for (let d = 0; d < c.distCount; d++) {
    for (let a = 1; a <= c.accessPerDist; a++) {
      accesses.push(makeNode('switch', `Access-SW-${d * c.accessPerDist + a}`, `Floor${d + 1}`));
    }
  }
  nodes.push(...accesses);

  accesses.forEach((access, idx) => {
    const distIdx = Math.floor(idx / c.accessPerDist);
    edges.push(makeEdge(access, dists[distIdx], 1, parseFloat((Math.random() * 0.7).toFixed(2))));
  });

  // --- Endpoint layer ---
  accesses.forEach((access) => {
    for (let e = 1; e <= c.endpointsPerAccess; e++) {
      const ep = makeNode('endpoint', `Host-${access.nodeName.split('-').pop()}-${e}`, access.group ?? 'default');
      nodes.push(ep);
      edges.push(makeEdge(access, ep, 0.1, parseFloat((Math.random() * 0.3).toFixed(2))));
    }
  });

  return { nodes, edges };
}

/**
 * 路由演示拓扑 — 20 台设备，核心环形 + 双归属 + 多路径。
 *
 * 层次：
 *   Core 环形:  C1 — C2 — C3 — C1  (cost 10，高带宽互联)
 *   Dist 环形:  D1—D2—D3—D4—D5—D6—D1  (每个 Dist 上联两台 Core，cost 20)
 *               D1/D2 挂 Core-1，D3/D4 挂 Core-2，D5/D6 挂 Core-3
 *   Access:     A1–A8，双归属到不同 Dist（cost 50）
 *   Server:     Srv1–Srv3，各接一台 Access（cost 100）
 *
 * OSPF 分区:
 *   Area 0  — Core 环 + Core↔Dist 上联
 *   Area 1  — D1/D2 + A1/A2/A3 + Srv1
 *   Area 2  — D3/D4 + A4/A5 + Srv2
 *   Area 3  — D5/D6 + A6/A7/A8 + Srv3
 *   D1–D6 全为 ABR（Area 0 + 各自所属 Area）
 *
 * IS-IS 分级:
 *   L2  — Core-1/2/3
 *   L1L2— Dist-1 ~ Dist-6
 *   L1  — Access-1 ~ Access-8，Srv-1 ~ Srv-3
 */
export function generateRoutingDemo(): { topology: TopologyData; protocolConfig: ProtocolConfig } {
  // ── 节点 ──────────────────────────────────────────────────────────────────
  const nodes: TopoNode[] = [
    // Core (3)
    { id: 'c1', nodeName: 'Core-1', type: 'router', group: 'Core', status: 'up' },
    { id: 'c2', nodeName: 'Core-2', type: 'router', group: 'Core', status: 'up' },
    { id: 'c3', nodeName: 'Core-3', type: 'router', group: 'Core', status: 'up' },
    // Dist (6)
    { id: 'd1', nodeName: 'Dist-1', type: 'switch', group: 'Dist-A', status: 'up' },
    { id: 'd2', nodeName: 'Dist-2', type: 'switch', group: 'Dist-A', status: 'up' },
    { id: 'd3', nodeName: 'Dist-3', type: 'switch', group: 'Dist-B', status: 'up' },
    { id: 'd4', nodeName: 'Dist-4', type: 'switch', group: 'Dist-B', status: 'up' },
    { id: 'd5', nodeName: 'Dist-5', type: 'switch', group: 'Dist-C', status: 'up' },
    { id: 'd6', nodeName: 'Dist-6', type: 'switch', group: 'Dist-C', status: 'up' },
    // Access (8)
    { id: 'a1', nodeName: 'Access-1', type: 'switch', group: 'Floor-1', status: 'up' },
    { id: 'a2', nodeName: 'Access-2', type: 'switch', group: 'Floor-1', status: 'up' },
    { id: 'a3', nodeName: 'Access-3', type: 'switch', group: 'Floor-2', status: 'up' },
    { id: 'a4', nodeName: 'Access-4', type: 'switch', group: 'Floor-2', status: 'up' },
    { id: 'a5', nodeName: 'Access-5', type: 'switch', group: 'Floor-3', status: 'up' },
    { id: 'a6', nodeName: 'Access-6', type: 'switch', group: 'Floor-3', status: 'up' },
    { id: 'a7', nodeName: 'Access-7', type: 'switch', group: 'Floor-4', status: 'up' },
    { id: 'a8', nodeName: 'Access-8', type: 'switch', group: 'Floor-4', status: 'up' },
    // Server (3)
    { id: 's1', nodeName: 'Srv-1', type: 'server', group: 'Servers', status: 'up' },
    { id: 's2', nodeName: 'Srv-2', type: 'server', group: 'Servers', status: 'up' },
    { id: 's3', nodeName: 'Srv-3', type: 'server', group: 'Servers', status: 'up' },
  ];

  // ── 边 ───────────────────────────────────────────────────────────────────
  const edges: TopoEdge[] = [
    // Core 环形 (3 条)
    { id: 'cc-1-2', src: { nodeName: 'Core-1', interface: 'Te0/0', bandwidth: 100, utilizationOut: 0.30 }, dst: { nodeName: 'Core-2', interface: 'Te0/0', bandwidth: 100, utilizationOut: 0.28 } },
    { id: 'cc-2-3', src: { nodeName: 'Core-2', interface: 'Te0/1', bandwidth: 100, utilizationOut: 0.35 }, dst: { nodeName: 'Core-3', interface: 'Te0/0', bandwidth: 100, utilizationOut: 0.32 } },
    { id: 'cc-3-1', src: { nodeName: 'Core-3', interface: 'Te0/1', bandwidth: 100, utilizationOut: 0.22 }, dst: { nodeName: 'Core-1', interface: 'Te0/1', bandwidth: 100, utilizationOut: 0.20 } },

    // Core → Dist 上联 (12 条, 每 Dist 双上联)
    { id: 'cd-1-d1', src: { nodeName: 'Core-1', interface: 'Gi1/0', bandwidth: 10, utilizationOut: 0.45 }, dst: { nodeName: 'Dist-1', interface: 'Gi0/0', bandwidth: 10, utilizationOut: 0.42 } },
    { id: 'cd-1-d2', src: { nodeName: 'Core-1', interface: 'Gi1/1', bandwidth: 10, utilizationOut: 0.38 }, dst: { nodeName: 'Dist-2', interface: 'Gi0/0', bandwidth: 10, utilizationOut: 0.36 } },
    { id: 'cd-2-d1', src: { nodeName: 'Core-2', interface: 'Gi1/0', bandwidth: 10, utilizationOut: 0.50 }, dst: { nodeName: 'Dist-1', interface: 'Gi0/1', bandwidth: 10, utilizationOut: 0.48 } },
    { id: 'cd-2-d3', src: { nodeName: 'Core-2', interface: 'Gi1/1', bandwidth: 10, utilizationOut: 0.60 }, dst: { nodeName: 'Dist-3', interface: 'Gi0/0', bandwidth: 10, utilizationOut: 0.58 } },
    { id: 'cd-2-d4', src: { nodeName: 'Core-2', interface: 'Gi1/2', bandwidth: 10, utilizationOut: 0.55 }, dst: { nodeName: 'Dist-4', interface: 'Gi0/0', bandwidth: 10, utilizationOut: 0.52 } },
    { id: 'cd-3-d3', src: { nodeName: 'Core-3', interface: 'Gi1/0', bandwidth: 10, utilizationOut: 0.40 }, dst: { nodeName: 'Dist-3', interface: 'Gi0/1', bandwidth: 10, utilizationOut: 0.38 } },
    { id: 'cd-3-d5', src: { nodeName: 'Core-3', interface: 'Gi1/1', bandwidth: 10, utilizationOut: 0.48 }, dst: { nodeName: 'Dist-5', interface: 'Gi0/0', bandwidth: 10, utilizationOut: 0.45 } },
    { id: 'cd-3-d6', src: { nodeName: 'Core-3', interface: 'Gi1/2', bandwidth: 10, utilizationOut: 0.33 }, dst: { nodeName: 'Dist-6', interface: 'Gi0/0', bandwidth: 10, utilizationOut: 0.31 } },
    { id: 'cd-1-d5', src: { nodeName: 'Core-1', interface: 'Gi1/2', bandwidth: 10, utilizationOut: 0.28 }, dst: { nodeName: 'Dist-5', interface: 'Gi0/1', bandwidth: 10, utilizationOut: 0.26 } },
    { id: 'cd-2-d6', src: { nodeName: 'Core-2', interface: 'Gi1/3', bandwidth: 10, utilizationOut: 0.42 }, dst: { nodeName: 'Dist-6', interface: 'Gi0/1', bandwidth: 10, utilizationOut: 0.40 } },

    // Dist 环形互联 (6 条)
    { id: 'dd-1-2', src: { nodeName: 'Dist-1', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.20 }, dst: { nodeName: 'Dist-2', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.18 } },
    { id: 'dd-2-3', src: { nodeName: 'Dist-2', interface: 'Gi1/1', bandwidth: 1, utilizationOut: 0.25 }, dst: { nodeName: 'Dist-3', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.23 } },
    { id: 'dd-3-4', src: { nodeName: 'Dist-3', interface: 'Gi1/1', bandwidth: 1, utilizationOut: 0.30 }, dst: { nodeName: 'Dist-4', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.28 } },
    { id: 'dd-4-5', src: { nodeName: 'Dist-4', interface: 'Gi1/1', bandwidth: 1, utilizationOut: 0.22 }, dst: { nodeName: 'Dist-5', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.20 } },
    { id: 'dd-5-6', src: { nodeName: 'Dist-5', interface: 'Gi1/1', bandwidth: 1, utilizationOut: 0.15 }, dst: { nodeName: 'Dist-6', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.14 } },
    { id: 'dd-6-1', src: { nodeName: 'Dist-6', interface: 'Gi1/1', bandwidth: 1, utilizationOut: 0.18 }, dst: { nodeName: 'Dist-1', interface: 'Gi1/1', bandwidth: 1, utilizationOut: 0.17 } },

    // Access 双归 (Access→两台 Dist, 16 条)
    { id: 'da-d1-a1', src: { nodeName: 'Dist-1', interface: 'Gi2/0', bandwidth: 1, utilizationOut: 0.55 }, dst: { nodeName: 'Access-1', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.50 } },
    { id: 'da-d2-a1', src: { nodeName: 'Dist-2', interface: 'Gi2/0', bandwidth: 1, utilizationOut: 0.50 }, dst: { nodeName: 'Access-1', interface: 'Gi0/1', bandwidth: 1, utilizationOut: 0.48 } },
    { id: 'da-d1-a2', src: { nodeName: 'Dist-1', interface: 'Gi2/1', bandwidth: 1, utilizationOut: 0.60 }, dst: { nodeName: 'Access-2', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.58 } },
    { id: 'da-d3-a2', src: { nodeName: 'Dist-3', interface: 'Gi2/0', bandwidth: 1, utilizationOut: 0.45 }, dst: { nodeName: 'Access-2', interface: 'Gi0/1', bandwidth: 1, utilizationOut: 0.43 } },
    { id: 'da-d2-a3', src: { nodeName: 'Dist-2', interface: 'Gi2/1', bandwidth: 1, utilizationOut: 0.70 }, dst: { nodeName: 'Access-3', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.68 } },
    { id: 'da-d4-a3', src: { nodeName: 'Dist-4', interface: 'Gi2/0', bandwidth: 1, utilizationOut: 0.65 }, dst: { nodeName: 'Access-3', interface: 'Gi0/1', bandwidth: 1, utilizationOut: 0.62 } },
    { id: 'da-d3-a4', src: { nodeName: 'Dist-3', interface: 'Gi2/1', bandwidth: 1, utilizationOut: 0.40 }, dst: { nodeName: 'Access-4', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.38 } },
    { id: 'da-d4-a4', src: { nodeName: 'Dist-4', interface: 'Gi2/1', bandwidth: 1, utilizationOut: 0.35 }, dst: { nodeName: 'Access-4', interface: 'Gi0/1', bandwidth: 1, utilizationOut: 0.33 } },
    { id: 'da-d4-a5', src: { nodeName: 'Dist-4', interface: 'Gi2/2', bandwidth: 1, utilizationOut: 0.48 }, dst: { nodeName: 'Access-5', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.45 } },
    { id: 'da-d5-a5', src: { nodeName: 'Dist-5', interface: 'Gi2/0', bandwidth: 1, utilizationOut: 0.52 }, dst: { nodeName: 'Access-5', interface: 'Gi0/1', bandwidth: 1, utilizationOut: 0.50 } },
    { id: 'da-d5-a6', src: { nodeName: 'Dist-5', interface: 'Gi2/1', bandwidth: 1, utilizationOut: 0.38 }, dst: { nodeName: 'Access-6', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.36 } },
    { id: 'da-d6-a6', src: { nodeName: 'Dist-6', interface: 'Gi2/0', bandwidth: 1, utilizationOut: 0.42 }, dst: { nodeName: 'Access-6', interface: 'Gi0/1', bandwidth: 1, utilizationOut: 0.40 } },
    { id: 'da-d6-a7', src: { nodeName: 'Dist-6', interface: 'Gi2/1', bandwidth: 1, utilizationOut: 0.55 }, dst: { nodeName: 'Access-7', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.53 } },
    { id: 'da-d1-a7', src: { nodeName: 'Dist-1', interface: 'Gi2/2', bandwidth: 1, utilizationOut: 0.60 }, dst: { nodeName: 'Access-7', interface: 'Gi0/1', bandwidth: 1, utilizationOut: 0.58 } },
    { id: 'da-d2-a8', src: { nodeName: 'Dist-2', interface: 'Gi2/2', bandwidth: 1, utilizationOut: 0.45 }, dst: { nodeName: 'Access-8', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.43 } },
    { id: 'da-d5-a8', src: { nodeName: 'Dist-5', interface: 'Gi2/2', bandwidth: 1, utilizationOut: 0.50 }, dst: { nodeName: 'Access-8', interface: 'Gi0/1', bandwidth: 1, utilizationOut: 0.48 } },

    // Server 上联 (3 条)
    { id: 'as-a2-s1', src: { nodeName: 'Access-2', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.80 }, dst: { nodeName: 'Srv-1', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.75 } },
    { id: 'as-a5-s2', src: { nodeName: 'Access-5', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.65 }, dst: { nodeName: 'Srv-2', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.62 } },
    { id: 'as-a7-s3', src: { nodeName: 'Access-7', interface: 'Gi1/0', bandwidth: 1, utilizationOut: 0.72 }, dst: { nodeName: 'Srv-3', interface: 'Gi0/0', bandwidth: 1, utilizationOut: 0.70 } },
  ];

  // ── OSPF 配置 ─────────────────────────────────────────────────────────────
  // Area 0: Core 环 + 所有 Core↔Dist 链路
  // Area 1: Dist-1/2 区域（D1/D2 做 ABR）
  // Area 2: Dist-3/4 区域（D3/D4 做 ABR）
  // Area 3: Dist-5/6 区域（D5/D6 做 ABR）
  const ospf: ProtocolConfig['ospf'] = {
    protocol: 'ospf',
    routers: [
      { nodeName: 'Core-1', routerId: '10.0.0.1', areas: ['0.0.0.0'] },
      { nodeName: 'Core-2', routerId: '10.0.0.2', areas: ['0.0.0.0'] },
      { nodeName: 'Core-3', routerId: '10.0.0.3', areas: ['0.0.0.0'] },
      { nodeName: 'Dist-1', routerId: '10.1.0.1', areas: ['0.0.0.0', '0.0.0.1'] },
      { nodeName: 'Dist-2', routerId: '10.1.0.2', areas: ['0.0.0.0', '0.0.0.1'] },
      { nodeName: 'Dist-3', routerId: '10.2.0.1', areas: ['0.0.0.0', '0.0.0.2'] },
      { nodeName: 'Dist-4', routerId: '10.2.0.2', areas: ['0.0.0.0', '0.0.0.2'] },
      { nodeName: 'Dist-5', routerId: '10.3.0.1', areas: ['0.0.0.0', '0.0.0.3'] },
      { nodeName: 'Dist-6', routerId: '10.3.0.2', areas: ['0.0.0.0', '0.0.0.3'] },
      { nodeName: 'Access-1', routerId: '10.1.1.1', areas: ['0.0.0.1'] },
      { nodeName: 'Access-2', routerId: '10.1.1.2', areas: ['0.0.0.1'] },
      { nodeName: 'Access-3', routerId: '10.1.1.3', areas: ['0.0.0.1'] },
      { nodeName: 'Access-4', routerId: '10.2.1.1', areas: ['0.0.0.2'] },
      { nodeName: 'Access-5', routerId: '10.2.1.2', areas: ['0.0.0.2'] },
      { nodeName: 'Access-6', routerId: '10.3.1.1', areas: ['0.0.0.3'] },
      { nodeName: 'Access-7', routerId: '10.3.1.2', areas: ['0.0.0.3'] },
      { nodeName: 'Access-8', routerId: '10.3.1.3', areas: ['0.0.0.3'] },
      { nodeName: 'Srv-1',    routerId: '10.1.2.1', areas: ['0.0.0.1'] },
      { nodeName: 'Srv-2',    routerId: '10.2.2.1', areas: ['0.0.0.2'] },
      { nodeName: 'Srv-3',    routerId: '10.3.2.1', areas: ['0.0.0.3'] },
    ],
    interfaces: [
      // Core 环 — area 0, cost 10
      { edgeId: 'cc-1-2',   srcCost: 10,  dstCost: 10,  area: '0.0.0.0' },
      { edgeId: 'cc-2-3',   srcCost: 10,  dstCost: 10,  area: '0.0.0.0' },
      { edgeId: 'cc-3-1',   srcCost: 10,  dstCost: 10,  area: '0.0.0.0' },
      // Core↔Dist 上联 — area 0, cost 20
      { edgeId: 'cd-1-d1',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-1-d2',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-2-d1',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-2-d3',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-2-d4',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-3-d3',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-3-d5',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-3-d6',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-1-d5',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      { edgeId: 'cd-2-d6',  srcCost: 20,  dstCost: 20,  area: '0.0.0.0' },
      // Dist 环形 — area 0, cost 30（横向备份，正常不优先）
      { edgeId: 'dd-1-2',   srcCost: 30,  dstCost: 30,  area: '0.0.0.0' },
      { edgeId: 'dd-2-3',   srcCost: 30,  dstCost: 30,  area: '0.0.0.0' },
      { edgeId: 'dd-3-4',   srcCost: 30,  dstCost: 30,  area: '0.0.0.0' },
      { edgeId: 'dd-4-5',   srcCost: 30,  dstCost: 30,  area: '0.0.0.0' },
      { edgeId: 'dd-5-6',   srcCost: 30,  dstCost: 30,  area: '0.0.0.0' },
      { edgeId: 'dd-6-1',   srcCost: 30,  dstCost: 30,  area: '0.0.0.0' },
      // Dist↔Access — area 1/2/3, cost 50
      { edgeId: 'da-d1-a1', srcCost: 50,  dstCost: 50,  area: '0.0.0.1' },
      { edgeId: 'da-d2-a1', srcCost: 50,  dstCost: 50,  area: '0.0.0.1' },
      { edgeId: 'da-d1-a2', srcCost: 50,  dstCost: 50,  area: '0.0.0.1' },
      { edgeId: 'da-d3-a2', srcCost: 50,  dstCost: 50,  area: '0.0.0.2' },
      { edgeId: 'da-d2-a3', srcCost: 50,  dstCost: 50,  area: '0.0.0.1' },
      { edgeId: 'da-d4-a3', srcCost: 50,  dstCost: 50,  area: '0.0.0.2' },
      { edgeId: 'da-d3-a4', srcCost: 50,  dstCost: 50,  area: '0.0.0.2' },
      { edgeId: 'da-d4-a4', srcCost: 50,  dstCost: 50,  area: '0.0.0.2' },
      { edgeId: 'da-d4-a5', srcCost: 50,  dstCost: 50,  area: '0.0.0.2' },
      { edgeId: 'da-d5-a5', srcCost: 50,  dstCost: 50,  area: '0.0.0.3' },
      { edgeId: 'da-d5-a6', srcCost: 50,  dstCost: 50,  area: '0.0.0.3' },
      { edgeId: 'da-d6-a6', srcCost: 50,  dstCost: 50,  area: '0.0.0.3' },
      { edgeId: 'da-d6-a7', srcCost: 50,  dstCost: 50,  area: '0.0.0.3' },
      { edgeId: 'da-d1-a7', srcCost: 50,  dstCost: 50,  area: '0.0.0.1' },
      { edgeId: 'da-d2-a8', srcCost: 50,  dstCost: 50,  area: '0.0.0.1' },
      { edgeId: 'da-d5-a8', srcCost: 50,  dstCost: 50,  area: '0.0.0.3' },
      // Access↔Server — area 1/2/3, cost 100
      { edgeId: 'as-a2-s1', srcCost: 100, dstCost: 100, area: '0.0.0.1' },
      { edgeId: 'as-a5-s2', srcCost: 100, dstCost: 100, area: '0.0.0.2' },
      { edgeId: 'as-a7-s3', srcCost: 100, dstCost: 100, area: '0.0.0.3' },
    ],
  };

  // ── IS-IS 配置 ────────────────────────────────────────────────────────────
  // L2:   Core-1/2/3
  // L1L2: Dist-1 ~ Dist-6
  // L1:   Access-1 ~ Access-8, Srv-1 ~ Srv-3
  const isis: ProtocolConfig['isis'] = {
    protocol: 'isis',
    routers: [
      { nodeName: 'Core-1',   systemId: '0000.0010.0001', level: 'L2'   },
      { nodeName: 'Core-2',   systemId: '0000.0010.0002', level: 'L2'   },
      { nodeName: 'Core-3',   systemId: '0000.0010.0003', level: 'L2'   },
      { nodeName: 'Dist-1',   systemId: '0000.0011.0001', level: 'L1L2' },
      { nodeName: 'Dist-2',   systemId: '0000.0011.0002', level: 'L1L2' },
      { nodeName: 'Dist-3',   systemId: '0000.0011.0003', level: 'L1L2' },
      { nodeName: 'Dist-4',   systemId: '0000.0011.0004', level: 'L1L2' },
      { nodeName: 'Dist-5',   systemId: '0000.0011.0005', level: 'L1L2' },
      { nodeName: 'Dist-6',   systemId: '0000.0011.0006', level: 'L1L2' },
      { nodeName: 'Access-1', systemId: '0000.0012.0001', level: 'L1'   },
      { nodeName: 'Access-2', systemId: '0000.0012.0002', level: 'L1'   },
      { nodeName: 'Access-3', systemId: '0000.0012.0003', level: 'L1'   },
      { nodeName: 'Access-4', systemId: '0000.0012.0004', level: 'L1'   },
      { nodeName: 'Access-5', systemId: '0000.0012.0005', level: 'L1'   },
      { nodeName: 'Access-6', systemId: '0000.0012.0006', level: 'L1'   },
      { nodeName: 'Access-7', systemId: '0000.0012.0007', level: 'L1'   },
      { nodeName: 'Access-8', systemId: '0000.0012.0008', level: 'L1'   },
      { nodeName: 'Srv-1',    systemId: '0000.0013.0001', level: 'L1'   },
      { nodeName: 'Srv-2',    systemId: '0000.0013.0002', level: 'L1'   },
      { nodeName: 'Srv-3',    systemId: '0000.0013.0003', level: 'L1'   },
    ],
    interfaces: [
      // Core 环 — L2, metric 10
      { edgeId: 'cc-1-2',   srcMetric: 10, dstMetric: 10, circuitLevel: 'L2' },
      { edgeId: 'cc-2-3',   srcMetric: 10, dstMetric: 10, circuitLevel: 'L2' },
      { edgeId: 'cc-3-1',   srcMetric: 10, dstMetric: 10, circuitLevel: 'L2' },
      // Core↔Dist — L2, metric 20
      { edgeId: 'cd-1-d1',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-1-d2',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-2-d1',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-2-d3',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-2-d4',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-3-d3',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-3-d5',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-3-d6',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-1-d5',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      { edgeId: 'cd-2-d6',  srcMetric: 20, dstMetric: 20, circuitLevel: 'L2' },
      // Dist 环 — L2, metric 30
      { edgeId: 'dd-1-2',   srcMetric: 30, dstMetric: 30, circuitLevel: 'L2' },
      { edgeId: 'dd-2-3',   srcMetric: 30, dstMetric: 30, circuitLevel: 'L2' },
      { edgeId: 'dd-3-4',   srcMetric: 30, dstMetric: 30, circuitLevel: 'L2' },
      { edgeId: 'dd-4-5',   srcMetric: 30, dstMetric: 30, circuitLevel: 'L2' },
      { edgeId: 'dd-5-6',   srcMetric: 30, dstMetric: 30, circuitLevel: 'L2' },
      { edgeId: 'dd-6-1',   srcMetric: 30, dstMetric: 30, circuitLevel: 'L2' },
      // Dist↔Access — L1, metric 50
      { edgeId: 'da-d1-a1', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d2-a1', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d1-a2', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d3-a2', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d2-a3', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d4-a3', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d3-a4', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d4-a4', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d4-a5', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d5-a5', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d5-a6', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d6-a6', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d6-a7', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d1-a7', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d2-a8', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      { edgeId: 'da-d5-a8', srcMetric: 50, dstMetric: 50, circuitLevel: 'L1' },
      // Access↔Server — L1, metric 100
      { edgeId: 'as-a2-s1', srcMetric: 100, dstMetric: 100, circuitLevel: 'L1' },
      { edgeId: 'as-a5-s2', srcMetric: 100, dstMetric: 100, circuitLevel: 'L1' },
      { edgeId: 'as-a7-s3', srcMetric: 100, dstMetric: 100, circuitLevel: 'L1' },
    ],
  };

  return { topology: { nodes, edges }, protocolConfig: { ospf, isis } };
}
