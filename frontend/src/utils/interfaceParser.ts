/**
 * interfaceParser.ts
 *
 * 从接口列表 JSON 推导网络拓扑连接关系。
 * 输入格式：[ { nodeName, type?, group?, vendor?, model?, interface?, ipv4Address?, ... } ]
 *           （兼容旧格式：{ "interfaces": [...] }）
 * 推导规则：同一子网内的接口归为同一组；2 个接口 → 直连边；>2 → 虚拟 segment 节点。
 * 设备级字段（type/group/vendor/model）取同一 nodeName 第一次出现时的值。
 */

import type { TopoNode, TopoEdge, TopologyData, EdgeEndpoint, DeviceType } from '../types/topo';

// ========== 公共接口 ==========

const VALID_DEVICE_TYPES: DeviceType[] = ['router', 'switch', 'firewall', 'server', 'ap', 'endpoint'];

export interface InterfaceRecord {
  nodeName: string;
  // 设备级字段（仅第一次出现的值生效）
  type?: DeviceType;
  group?: string;
  vendor?: string;
  model?: string;
  // 接口级字段
  interface?: string;
  ipv4Address?: string;
  ipv4Mask?: string;
  ipv6Address?: string;
  ipv6Mask?: string;    // 前缀长度，字符串形式如 "64"
  utilizationOut?: number;
  bandwidth?: number;
  status?: 'up' | 'down';
}

// ========== IPv4 工具 ==========

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0) >>> 0;
}

function intToIPv4(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.');
}

function dotMaskToPrefix(mask: string): number {
  const n = ipv4ToInt(mask);
  let count = 0;
  for (let bit = 31; bit >= 0; bit--) {
    if ((n >>> bit) & 1) count++;
    else break;
  }
  return count;
}

/**
 * 返回 "x.x.x.x/prefix"，或 null（/32 loopback 跳过）。
 * mask 支持点分十进制（"255.255.255.252"）和 CIDR 前缀（"30"）。
 */
function getIPv4NetworkKey(ip: string, mask: string): string | null {
  const prefix = mask.includes('.') ? dotMaskToPrefix(mask) : parseInt(mask, 10);
  if (prefix === 32) return null;

  const ipInt = ipv4ToInt(ip);
  const maskInt = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const networkInt = (ipInt & maskInt) >>> 0;

  return `${intToIPv4(networkInt)}/${prefix}`;
}

// ========== IPv6 工具 ==========

/** 将可能包含 :: 的 IPv6 地址展开为完整的 8 组 4 位十六进制 */
function expandIPv6(ip: string): string {
  const halves = ip.split('::');
  if (halves.length > 2) throw new Error(`无效 IPv6 地址: ${ip}`);

  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const missingCount = 8 - left.length - right.length;
    const middle = Array<string>(missingCount).fill('0000');
    return [...left, ...middle, ...right].map(g => g.padStart(4, '0')).join(':');
  }

  return ip.split(':').map(g => g.padStart(4, '0')).join(':');
}

/**
 * 返回 "xxxx:xxxx:.../prefix"（展开形式），或 null（/128 loopback 跳过）。
 */
function getIPv6NetworkKey(ip: string, prefixLen: number): string | null {
  if (prefixLen === 128) return null;

  const expanded = expandIPv6(ip);
  const hexStr = expanded.split(':').join('');
  const addrBig = BigInt('0x' + hexStr);

  const totalBits = 128n;
  const maskBig =
    prefixLen === 0
      ? 0n
      : ((1n << totalBits) - 1n) - ((1n << BigInt(128 - prefixLen)) - 1n);

  const networkBig = addrBig & maskBig;
  const networkHex = networkBig.toString(16).padStart(32, '0');

  const groups: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    groups.push(networkHex.slice(i, i + 4));
  }

  return `${groups.join(':')}/${prefixLen}`;
}

// ========== 通用工具 ==========

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ifaceKey(r: InterfaceRecord): string {
  return `${r.nodeName}:${r.interface ?? ''}`;
}

function pairKey(a: InterfaceRecord, b: InterfaceRecord): string {
  const ka = ifaceKey(a);
  const kb = ifaceKey(b);
  return ka <= kb ? `${ka}—${kb}` : `${kb}—${ka}`;
}

function toEndpoint(r: InterfaceRecord): EdgeEndpoint {
  const ep: EdgeEndpoint = { nodeName: r.nodeName, status: r.status ?? 'up' };
  if (r.interface !== undefined) ep.interface = r.interface;
  if (r.ipv4Address !== undefined) ep.ipv4Address = r.ipv4Address;
  if (r.ipv4Mask !== undefined) ep.ipv4Mask = r.ipv4Mask;
  if (r.ipv6Address !== undefined) ep.ipv6Address = r.ipv6Address;
  if (r.ipv6Mask !== undefined) ep.ipv6Mask = r.ipv6Mask;
  if (r.utilizationOut !== undefined) ep.utilizationOut = r.utilizationOut;
  if (r.bandwidth !== undefined) ep.bandwidth = r.bandwidth;
  return ep;
}

/** 将 incoming 中 existing 缺少的 IP 字段合并进来，返回新对象（不可变）。 */
function mergeIPFields(
  existing: InterfaceRecord,
  incoming: InterfaceRecord,
): InterfaceRecord {
  return {
    ...existing,
    ...(existing.ipv4Address === undefined && incoming.ipv4Address !== undefined
      ? { ipv4Address: incoming.ipv4Address, ipv4Mask: incoming.ipv4Mask }
      : {}),
    ...(existing.ipv6Address === undefined && incoming.ipv6Address !== undefined
      ? { ipv6Address: incoming.ipv6Address, ipv6Mask: incoming.ipv6Mask }
      : {}),
  };
}

// ========== 主解析函数 ==========

export function parseInterfaceList(jsonStr: string): TopologyData {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new Error('JSON 解析失败，请检查格式');
  }

  // Accept flat array or legacy { "interfaces": [...] } wrapper
  const records: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>).interfaces)
      ? (raw as Record<string, unknown>).interfaces as unknown[]
      : null!;

  if (!records) {
    throw new Error('格式错误：需要 JSON 数组，或包含 "interfaces" 数组的 JSON 对象');
  }
  const ifaces: InterfaceRecord[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r || typeof r !== 'object') {
      throw new Error(`第 ${i + 1} 条记录格式错误`);
    }
    const rec = r as Record<string, unknown>;
    if (!rec.nodeName || typeof rec.nodeName !== 'string' || !rec.nodeName.trim()) {
      throw new Error(`第 ${i + 1} 条记录缺少必填字段 "nodeName"`);
    }
    const rawType = typeof rec.type === 'string' ? rec.type : undefined;
    ifaces.push({
      nodeName: (rec.nodeName as string).trim(),
      type: rawType && (VALID_DEVICE_TYPES as string[]).includes(rawType)
        ? (rawType as DeviceType)
        : undefined,
      group: typeof rec.group === 'string' && rec.group.trim() ? rec.group.trim() : undefined,
      vendor: typeof rec.vendor === 'string' && rec.vendor.trim() ? rec.vendor.trim() : undefined,
      model: typeof rec.model === 'string' && rec.model.trim() ? rec.model.trim() : undefined,
      interface: typeof rec.interface === 'string' ? rec.interface : undefined,
      ipv4Address: typeof rec.ipv4Address === 'string' ? rec.ipv4Address : undefined,
      ipv4Mask: typeof rec.ipv4Mask === 'string' ? rec.ipv4Mask : undefined,
      ipv6Address: typeof rec.ipv6Address === 'string' ? rec.ipv6Address : undefined,
      ipv6Mask: rec.ipv6Mask !== undefined ? String(rec.ipv6Mask) : undefined,
      utilizationOut: typeof rec.utilizationOut === 'number' ? rec.utilizationOut : undefined,
      bandwidth: typeof rec.bandwidth === 'number' ? rec.bandwidth : undefined,
      status: rec.status === 'down' ? 'down' : 'up',
    });
  }

  // ── Pass 1：建子网映射表 ──────────────────────────────────────────────────────

  // key 格式：`v4:10.0.0.0/30` 或 `v6:2001:0db8::.../64`，区分两个 IP 族
  const subnetMap = new Map<string, InterfaceRecord[]>();

  const addToSubnet = (key: string, rec: InterfaceRecord) => {
    const group = subnetMap.get(key);
    if (group) group.push(rec);
    else subnetMap.set(key, [rec]);
  };

  for (const iface of ifaces) {
    if (iface.ipv4Address && iface.ipv4Mask) {
      try {
        const key = getIPv4NetworkKey(iface.ipv4Address, iface.ipv4Mask);
        if (key) addToSubnet(`v4:${key}`, iface);
      } catch {
        // 忽略无效 IP
      }
    }
    if (iface.ipv6Address && iface.ipv6Mask) {
      try {
        const key = getIPv6NetworkKey(iface.ipv6Address, parseInt(iface.ipv6Mask, 10));
        if (key) addToSubnet(`v6:${key}`, iface);
      } catch {
        // 忽略无效 IPv6
      }
    }
  }

  // ── Pass 2：分类处理 ─────────────────────────────────────────────────────────

  // P2P：每个接口对存一份记录，便于合并 IPv4+IPv6 信息（不可变更新）
  const pairRecordMap = new Map<string, { a: InterfaceRecord; b: InterfaceRecord }>();

  // Segment：已处理的段，避免重复建节点；已建的接口→段边，避免重复
  const segmentSeen = new Set<string>();         // segId
  const segmentNodeList: TopoNode[] = [];
  const segmentEdgeList: Array<{ iface: InterfaceRecord; segName: string }> = [];
  const seenSegmentLinks = new Set<string>();    // `${ifaceKey}—${segId}`

  for (const [subnetKey, group] of subnetMap) {
    if (group.length === 2) {
      const [a, b] = group;
      const pk = pairKey(a, b);

      if (pairRecordMap.has(pk)) {
        // 已有同接口对的边（来自另一 IP 族），合并 IP 字段
        const existing = pairRecordMap.get(pk)!;
        // 判断 existing.a 对应哪条记录
        const aMatchesExistingA =
          existing.a.nodeName === a.nodeName &&
          (existing.a.interface ?? '') === (a.interface ?? '');

        const [matchedA, matchedB] = aMatchesExistingA ? [a, b] : [b, a];
        pairRecordMap.set(pk, {
          a: mergeIPFields(existing.a, matchedA),
          b: mergeIPFields(existing.b, matchedB),
        });
      } else {
        pairRecordMap.set(pk, { a, b });
      }
    } else if (group.length > 2) {
      const netAddr = subnetKey.replace(/^v[46]:/, '');
      const segId = `seg-${slugify(netAddr)}`;

      if (!segmentSeen.has(segId)) {
        segmentSeen.add(segId);
        segmentNodeList.push({
          id: segId,
          nodeName: netAddr,
          type: 'segment',
          status: 'up',
          group: 'default',
        });
      }

      for (const iface of group) {
        const linkKey = `${ifaceKey(iface)}—${segId}`;
        if (!seenSegmentLinks.has(linkKey)) {
          seenSegmentLinks.add(linkKey);
          segmentEdgeList.push({ iface, segName: netAddr });
        }
      }
    }
    // group.length === 1：孤立接口，仅建节点（在 Pass 3 中处理）
  }

  // ── Pass 3：组装结果 ─────────────────────────────────────────────────────────

  // 设备节点：所有出现在接口列表中的 nodeName
  // 设备级字段（type/group/vendor/model）取同一 nodeName 第一次出现时的值
  const nodeSet = new Set<string>();
  const deviceNodes: TopoNode[] = [];

  for (const iface of ifaces) {
    if (!nodeSet.has(iface.nodeName)) {
      nodeSet.add(iface.nodeName);
      deviceNodes.push({
        id: slugify(iface.nodeName),
        nodeName: iface.nodeName,
        type: iface.type ?? 'router',
        ...(iface.vendor !== undefined ? { vendor: iface.vendor } : {}),
        ...(iface.model !== undefined ? { model: iface.model } : {}),
        status: 'up',
        group: iface.group ?? 'default',
      });
    }
  }

  // 边：P2P + Segment
  let edgeIdx = 0;
  const edges: TopoEdge[] = [];

  for (const { a, b } of pairRecordMap.values()) {
    edges.push({ id: `link-${edgeIdx++}`, src: toEndpoint(a), dst: toEndpoint(b) });
  }

  for (const { iface, segName } of segmentEdgeList) {
    edges.push({
      id: `link-${edgeIdx++}`,
      src: toEndpoint(iface),
      dst: { nodeName: segName, status: 'up' },
    });
  }

  return {
    nodes: [...deviceNodes, ...segmentNodeList],
    edges,
  };
}
