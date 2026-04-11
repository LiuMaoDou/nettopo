import type {
  TopologyData, TopoNode, TopoEdge, TopoGroup, DeviceType
} from '../types/topo';

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
  const groups: TopoGroup[] = [];
  let nodeIdx = 0;
  let edgeIdx = 0;

  // --- Helper ---
  const makeNode = (
    type: DeviceType, label: string, group: string, ip: string
  ): TopoNode => ({
    id: `node-${nodeIdx++}`,
    label,
    type,
    ip,
    status: Math.random() > 0.05 ? 'up' : 'down',
    group,
    interfaces: [],
  });

  const makeEdge = (
    src: string, dst: string, bw: number
  ): TopoEdge => ({
    id: `edge-${edgeIdx++}`,
    source: src,
    target: dst,
    sourcePort: 'Gi0/1',
    targetPort: 'Gi0/2',
    bandwidth: bw,
    utilizationOut: Math.random(),
    utilizationIn:  Math.random(),
    protocol: bw >= 10000 ? 'fiber' : 'ethernet',
    status: 'up',
  });

  // --- Core 层 ---
  groups.push({ id: 'g-core', label: 'Core', type: 'subnet' });
  const coreNodes: TopoNode[] = [];
  for (let i = 0; i < c.coreCount; i++) {
    const n = makeNode('router', `Core-${i+1}`, 'g-core', `10.0.0.${i+1}`);
    coreNodes.push(n);
    nodes.push(n);
  }
  // Core 全互联
  for (let i = 0; i < coreNodes.length; i++) {
    for (let j = i + 1; j < coreNodes.length; j++) {
      edges.push(makeEdge(coreNodes[i].id, coreNodes[j].id, 100000));
    }
  }

  // --- Distribution 层 ---
  const distNodes: TopoNode[] = [];
  for (let i = 0; i < c.distCount; i++) {
    const gid = `g-dist-${i}`;
    groups.push({ id: gid, label: `Dist-VLAN${100+i}`, type: 'vlan' });
    const n = makeNode('switch', `Dist-SW-${i+1}`, gid, `10.1.${i}.1`);
    distNodes.push(n);
    nodes.push(n);
    // 每个 Dist 连接所有 Core
    for (const core of coreNodes) {
      edges.push(makeEdge(n.id, core.id, 40000));
    }
  }

  // --- Access 层 ---
  let accessIdx = 0;
  for (let d = 0; d < distNodes.length; d++) {
    for (let a = 0; a < c.accessPerDist; a++) {
      const gid = distNodes[d].group!;
      const sw = makeNode(
        'switch',
        `Access-SW-${accessIdx+1}`,
        gid,
        `10.1.${d}.${10+a}`
      );
      nodes.push(sw);
      edges.push(makeEdge(sw.id, distNodes[d].id, 10000));

      // --- Endpoint 层 ---
      for (let e = 0; e < c.endpointsPerAccess; e++) {
        const ep = makeNode(
          Math.random() > 0.3 ? 'endpoint' : 'server',
          `Host-${accessIdx}-${e+1}`,
          gid,
          `10.1.${d}.${100 + a * 20 + e}`
        );
        nodes.push(ep);
        edges.push(makeEdge(ep.id, sw.id, 1000));
      }
      accessIdx++;
    }
  }

  return { nodes, edges, groups };
}
