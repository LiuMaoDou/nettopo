import type { TopologyData, TopoNode, TopoEdge, EdgeEndpoint, DeviceType, DeviceStatus, LinkStatus } from '../types/topo';

const VALID_DEVICE_TYPES = new Set<string>(['router', 'switch', 'firewall', 'server', 'ap', 'endpoint']);

/**
 * Strip // line comments from a JSON string, preserving content inside quoted strings.
 * Allows importing JSONC-style template files that contain // annotations.
 */
function stripJsonComments(str: string): string {
  return str.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (_, quoted: string) => quoted ?? '');
}

/** Slugify a label into a safe ID: "Core Router 1" → "core-router-1" */
function slugify(str: string, fallback: string): string {
  const s = str.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || fallback;
}

// ===== JSON 导入 =====

/**
 * Parse a JSON string into TopologyData.
 * Required node fields: nodeName, type — throws on missing or invalid values.
 * Optional fields use defaults: status → 'up'.
 */
export function parseJSON(jsonStr: string): TopologyData {
  const raw: unknown = JSON.parse(stripJsonComments(jsonStr));
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !Array.isArray((raw as Record<string, unknown>).nodes) ||
    !Array.isArray((raw as Record<string, unknown>).edges)
  ) {
    throw new Error('JSON 格式错误: 需要 nodes 和 edges 数组');
  }
  const r = raw as Record<string, unknown[]>;
  const nodes = (r.nodes as Record<string, unknown>[]).map((n, idx) => {
    const pos = `nodes[${idx}]`;

    if (!n.nodeName || typeof n.nodeName !== 'string' || !n.nodeName.trim()) {
      throw new Error(`${pos}: 缺少必填字段 nodeName`);
    }
    if (n.type && !VALID_DEVICE_TYPES.has(n.type as string)) {
      throw new Error(`${pos} (${n.nodeName}): 无效的 type，允许值: ${[...VALID_DEVICE_TYPES].join(', ')}`);
    }

    const nodeName = n.nodeName.trim();
    return {
      id:      n.id ?? slugify(nodeName, `node-${idx}`),
      nodeName,
      type:    (n.type as DeviceType | undefined) ?? 'router',
      status:  (n.status as DeviceStatus | undefined) ?? 'up',
      vendor:  (n.vendor as string | undefined) || undefined,
      model:   (n.model  as string | undefined) || undefined,
      group:   (n.group  as string | undefined) || 'default',
    } satisfies TopoNode;
  });

  const edges = (r.edges as Record<string, unknown>[]).map((e, idx) => {
    const pos = `edges[${idx}]`;
    const src = e.src as Record<string, unknown> | undefined;
    const dst = e.dst as Record<string, unknown> | undefined;
    if (!src?.nodeName) throw new Error(`${pos}: 缺少必填字段 src.nodeName`);
    if (!dst?.nodeName) throw new Error(`${pos}: 缺少必填字段 dst.nodeName`);
    return { ...e, id: e.id ?? `link-${idx}` };
  }) as TopoEdge[];

  return { nodes, edges };
}

// ===== CSV 导入 =====

/**
 * Parse a devices CSV string into an array of TopoNode.
 * Required columns: nodeName, type — throws on missing or invalid values.
 * Optional columns: vendor, model, group, status (default: 'up').
 */
export function parseDevicesCSV(csv: string): TopoNode[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const pos = `行 ${idx + 2}`;
    const vals = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });

    const nodeName = (row.nodeName ?? row.hostname ?? '').trim();
    if (!nodeName) throw new Error(`${pos}: 缺少必填字段 nodeName`);

    const type = row.type ?? '';
    if (type && !VALID_DEVICE_TYPES.has(type)) {
      throw new Error(`${pos} (${nodeName}): 无效的 type，允许值: ${[...VALID_DEVICE_TYPES].join(', ')}`);
    }

    return {
      id:     row.id || slugify(nodeName, `node-${idx}`),
      nodeName,
      type:   (type as DeviceType | undefined) || 'router',
      status: ((row.status as DeviceStatus) || undefined) ?? 'up',
      vendor: row.vendor || undefined,
      model:  row.model  || undefined,
      group:  row.group || row.vlan || 'default',
    } satisfies TopoNode;
  });
}

/**
 * Parse a links CSV string into an array of TopoEdge.
 * `id` column is optional — auto-generated sequentially if absent.
 * Required columns: srcNodeName, dstNodeName
 * Optional columns (per endpoint): interface, ipv4Address, ipv4Mask, ipv6Address, ipv6Mask,
 *   utilizationOut, bandwidth, status
 */
export function parseLinksCSV(csv: string): TopoEdge[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const pos = `行 ${idx + 2}`;
    const vals = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });

    const srcNodeName = row.srcNodeName?.trim();
    const dstNodeName = row.dstNodeName?.trim();
    if (!srcNodeName) throw new Error(`${pos}: 缺少必填字段 srcNodeName`);
    if (!dstNodeName) throw new Error(`${pos}: 缺少必填字段 dstNodeName`);

    const parseEndpoint = (prefix: 'src' | 'dst', nodeName: string): EdgeEndpoint => ({
      nodeName,
      interface:      row[`${prefix}Interface`]      || undefined,
      ipv4Address:    row[`${prefix}Ipv4Address`]    || undefined,
      ipv4Mask:       row[`${prefix}Ipv4Mask`]       || undefined,
      ipv6Address:    row[`${prefix}Ipv6Address`]    || undefined,
      ipv6Mask:       row[`${prefix}Ipv6Mask`]       || undefined,
      utilizationOut: row[`${prefix}UtilizationOut`] ? Number(row[`${prefix}UtilizationOut`]) : undefined,
      bandwidth:      row[`${prefix}Bandwidth`]      ? Number(row[`${prefix}Bandwidth`])      : undefined,
      status:         (row[`${prefix}Status`] as LinkStatus) || undefined,
    });

    return {
      id:  row.id || `link-${idx}`,
      src: parseEndpoint('src', srcNodeName),
      dst: parseEndpoint('dst', dstNodeName),
    };
  });
}
