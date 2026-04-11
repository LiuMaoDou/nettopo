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
export type LinkProtocol = 'ethernet' | 'fiber' | 'wifi';
export type GroupType = 'vlan' | 'subnet' | 'site' | 'floor' | 'rack';
export type LayoutType = 'force' | 'dagre' | 'circular' | 'radial' | 'combo';

// ========== 接口 ==========
export interface DeviceInterface {
  name: string;            // e.g. "GigabitEthernet0/1"
  ip?: string;
  mac?: string;
  speed?: number;          // Mbps
  status: LinkStatus;
}

// ========== 设备节点 ==========
export interface TopoNode {
  id: string;
  label: string;
  type: DeviceType;
  ip: string;
  mac?: string;
  vendor?: string;
  model?: string;
  location?: string;
  group?: string;          // 所属分组 ID
  status: DeviceStatus;
  interfaces: DeviceInterface[];
  // G6 布局坐标（运行时填充）
  x?: number;
  y?: number;
}

// ========== 连接边 ==========
export interface TopoEdge {
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  targetPort: string;
  bandwidth?: number;      // Mbps
  utilizationOut?: number; // 0-1, outbound (source → target)
  utilizationIn?: number;  // 0-1, inbound  (target → source)
  protocol?: LinkProtocol;
  status: LinkStatus;
}

// ========== 分组 ==========
export interface TopoGroup {
  id: string;
  label: string;
  type: GroupType;
  parentId?: string;       // 嵌套分组
}

// ========== 完整拓扑数据 ==========
export interface TopologyData {
  nodes: TopoNode[];
  edges: TopoEdge[];
  groups: TopoGroup[];
}
