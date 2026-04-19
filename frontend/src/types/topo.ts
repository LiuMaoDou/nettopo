// ========== 设备类型枚举 ==========
export type DeviceType =
  | 'router'
  | 'switch'
  | 'firewall'
  | 'server'
  | 'ap'
  | 'endpoint'
  | 'segment';   // 虚拟广播域节点，由接口列表推导自动生成

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

// ========== 协议配置 ==========

export type IsisLevel = 'L1' | 'L2' | 'L1L2';

// ── OSPF ──────────────────────────────────────────────────────────────────────

/** 单台路由器上一个接口的 OSPF 配置。 */
export interface OspfIfaceConfig {
  name: string;                              // 接口名，对应 EdgeEndpoint.interface
  cost?: number;                             // 出方向 cost，默认 10
  area?: string;                             // 默认 "0.0.0.0"
  networkType?: 'point-to-point' | 'broadcast';
  passive?: boolean;
}

export interface OspfRouterConfig {
  nodeName: string;
  routerId: string;                          // 点分十进制，如 "1.1.1.1"
  areas: string[];                           // 如 ["0.0.0.0"]；ABR 多个
  interfaces?: OspfIfaceConfig[];            // 未列出的接口从 bandwidth 自动推算
}

export interface OspfConfig {
  protocol: 'ospf';
  routers: OspfRouterConfig[];
  referenceBandwidth?: number;               // Gbps，默认 100；auto-cost = ceil(ref / bw)
}

// ── IS-IS ─────────────────────────────────────────────────────────────────────

/** 单台路由器上一个接口的 IS-IS 配置。 */
export interface IsisIfaceConfig {
  name: string;
  metric?: number;                           // 出方向 metric，默认 defaultMetric
  circuitLevel?: IsisLevel;                  // 不填则从两端 level 自动推断
}

export interface IsisRouterConfig {
  nodeName: string;
  systemId: string;                          // 如 "0000.0000.0001"
  level: IsisLevel;
  interfaces?: IsisIfaceConfig[];
}

export interface IsisConfig {
  protocol: 'isis';
  routers: IsisRouterConfig[];
  defaultMetric?: number;                    // 默认 10
}

export interface ProtocolConfig {
  ospf?: OspfConfig;
  isis?: IsisConfig;
}

// ========== SPF 计算结果 ==========

export interface NextHopInfo {
  routerId: string;
  edgeId: string;
}

export interface RoutingResult {
  protocol: 'ospf' | 'isis';
  sourceRouterId: string;
  costs: Record<string, number>;         // routerId/systemId → 累计 cost
  nextHops: Record<string, NextHopInfo>;
  sptEdgeIds: string[];                  // 全 SPT 边集合
  nodeIds: string[];                     // 可达节点 id
  nodeIdToCost: Record<string, number>;  // topo node_id → 累计 cost
  pathEdges: Record<string, string[]>;   // routerId → [edgeId, ...] 完整路径边
  pathNodes: Record<string, string[]>;   // routerId → [routerId, ...] 完整路径节点
  unreachable: string[];
}
