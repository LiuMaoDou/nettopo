import type { TopologyData, TopoNode, TopoEdge, DeviceType } from '../types/topo';

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

  const makeEdge = (srcName: string, dstName: string, bw: number): TopoEdge => ({
    id: `edge-${edgeIdx++}`,
    src: { nodeName: srcName, bandwidth: bw, status: 'up', utilizationOut: Math.random() },
    dst: { nodeName: dstName, bandwidth: bw, status: 'up', utilizationOut: Math.random() },
  });

  // --- Core 层 ---
  const coreNodes: TopoNode[] = [];
  for (let i = 0; i < c.coreCount; i++) {
    const n = makeNode('router', `Core-${i+1}`, 'Core');
    coreNodes.push(n);
    nodes.push(n);
  }
  // Core 全互联
  for (let i = 0; i < coreNodes.length; i++) {
    for (let j = i + 1; j < coreNodes.length; j++) {
      edges.push(makeEdge(coreNodes[i].nodeName, coreNodes[j].nodeName, 100));
    }
  }

  // --- Distribution 层 ---
  const distNodes: TopoNode[] = [];
  for (let i = 0; i < c.distCount; i++) {
    const group = `Dist-VLAN${100 + i}`;
    const n = makeNode('switch', `Dist-SW-${i+1}`, group);
    distNodes.push(n);
    nodes.push(n);
    for (const core of coreNodes) {
      edges.push(makeEdge(n.nodeName, core.nodeName, 40));
    }
  }

  // --- Access 层 ---
  let accessIdx = 0;
  for (let d = 0; d < distNodes.length; d++) {
    for (let a = 0; a < c.accessPerDist; a++) {
      const group = distNodes[d].group!;
      const sw = makeNode('switch', `Access-SW-${accessIdx+1}`, group);
      nodes.push(sw);
      edges.push(makeEdge(sw.nodeName, distNodes[d].nodeName, 10));

      // --- Endpoint 层 ---
      for (let e = 0; e < c.endpointsPerAccess; e++) {
        const ep = makeNode(
          Math.random() > 0.3 ? 'endpoint' : 'server',
          `Host-${accessIdx}-${e+1}`,
          group
        );
        nodes.push(ep);
        edges.push(makeEdge(ep.nodeName, sw.nodeName, 1));
      }
      accessIdx++;
    }
  }

  return { nodes, edges };
}
