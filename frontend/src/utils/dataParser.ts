import type { TopologyData, TopoNode, TopoEdge, DeviceType, DeviceStatus, LinkStatus, LinkProtocol } from '../types/topo';

/** Slugify a label into a safe ID: "Core Router 1" → "core-router-1" */
function slugify(str: string, fallback: string): string {
  const s = str.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || fallback;
}

// ===== JSON 导入 =====

/**
 * Parse a JSON string into TopologyData.
 * `id` is optional in nodes/edges — auto-generated from label if absent.
 */
export function parseJSON(jsonStr: string): TopologyData {
  const raw: unknown = JSON.parse(jsonStr);
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
    const label = String(n.label ?? `Device-${idx}`);
    return { ...n, id: n.id ?? slugify(label, `node-${idx}`), label } as TopoNode;
  });
  const edges = (r.edges as Record<string, unknown>[]).map((e, idx) => ({
    ...e,
    id: e.id ?? `link-${idx}`,
  })) as TopoEdge[];
  return {
    nodes,
    edges,
    groups: (r.groups as TopologyData['groups']) ?? [],
  };
}

// ===== CSV 导入 =====

/**
 * Parse a devices CSV string into an array of TopoNode.
 * `id` column is optional — auto-generated from label if absent.
 * Expected columns: label/hostname, type, ip, mac, vendor, model, location, group/vlan, status
 */
export function parseDevicesCSV(csv: string): TopoNode[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const vals = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });

    const label = row.label ?? row.hostname ?? `Device-${idx}`;
    return {
      id:       row.id || slugify(label, `node-${idx}`),
      label,
      type:     (row.type as DeviceType) || 'endpoint',
      ip:       row.ip ?? '',
      mac:      row.mac || undefined,
      vendor:   row.vendor || undefined,
      model:    row.model || undefined,
      location: row.location || undefined,
      group:    row.group ?? row.vlan ?? undefined,
      status:   (row.status as DeviceStatus) || 'up',
      interfaces: [],
    };
  });
}

/**
 * Parse a links CSV string into an array of TopoEdge.
 * `id` column is optional — auto-generated sequentially if absent.
 * `source`/`target` reference device labels (same as auto-generated node IDs).
 * Expected columns: source, target, sourcePort, targetPort, bandwidth,
 *   utilizationOut, utilizationIn, protocol, status
 */
export function parseLinksCSV(csv: string): TopoEdge[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const vals = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });

    // source/target may be labels — slugify to match auto-generated node IDs
    const src = row.source ?? '';
    const dst = row.target ?? '';
    return {
      id:             row.id || `link-${idx}`,
      source:         slugify(src, src),
      target:         slugify(dst, dst),
      sourcePort:     row.sourcePort ?? row.source_port ?? '',
      targetPort:     row.targetPort ?? row.target_port ?? '',
      bandwidth:      row.bandwidth      ? Number(row.bandwidth)      : undefined,
      utilizationOut: row.utilizationOut ? Number(row.utilizationOut) : undefined,
      utilizationIn:  row.utilizationIn  ? Number(row.utilizationIn)  : undefined,
      protocol:       (row.protocol as LinkProtocol) || 'ethernet',
      status:         (row.status as LinkStatus) || 'up',
    };
  });
}
