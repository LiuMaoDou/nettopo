// ========== 设备类型枚举 ==========
export type DeviceType =
  | 'router'
  | 'switch'
  | 'firewall'
  | 'server'
  | 'ap'
  | 'endpoint';

export type DeviceStatus = 'up' | 'down' | 'warning';
export type LinkStatus = 'up' | 'down';
export type LayoutType = 'force' | 'dagre' | 'circular' | 'radial' | 'combo';

// ========== 设备节点 ==========
export interface TopoNode {
  id: string;
  nodeName: string;
  type?: DeviceType;        // 可选，默认 router
  vendor?: string;
  model?: string;
  group?: string;           // 分组名称；未填时默认 "default"（不显示 combo）
  status?: DeviceStatus;
  // G6 布局坐标（运行时填充）
  x?: number;
  y?: number;
}

// ========== 链路端点信息 ==========
export interface EdgeEndpoint {
  nodeName: string;        // 必填 — 对应 TopoNode.nodeName
  interface?: string;
  ipv4Address?: string;
  ipv4Mask?: string;
  ipv6Address?: string;
  ipv6Mask?: string;
  utilizationOut?: number; // 0-1, outbound from this endpoint
  bandwidth?: number;      // Gbps
  status?: LinkStatus;     // defaults to 'up'
}

// ========== 连接边 ==========
export interface TopoEdge {
  id: string;
  src: EdgeEndpoint;
  dst: EdgeEndpoint;
}

// ========== 完整拓扑数据 ==========
export interface TopologyData {
  nodes: TopoNode[];
  edges: TopoEdge[];
}
