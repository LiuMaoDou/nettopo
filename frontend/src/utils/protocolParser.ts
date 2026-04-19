/**
 * 解析并校验 OSPF / IS-IS 协议配置 JSON。
 *
 * 后端用 snake_case，前端用 camelCase；
 * 两种格式均可接受（字段名兼容处理）。
 */

import type {
  ProtocolConfig,
  OspfConfig,
  OspfRouterConfig,
  OspfIfaceConfig,
  IsisConfig,
  IsisRouterConfig,
  IsisIfaceConfig,
  IsisLevel,
} from '../types/topo';

export interface ParseError {
  field: string;
  message: string;
}

export interface ParseResult<T> {
  data: T | null;
  errors: ParseError[];
}

// ── 工具：取字段（兼容 snake_case 和 camelCase） ──────────────────────────────
function get(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  return undefined;
}

// ── OSPF 接口配置 ─────────────────────────────────────────────────────────────

function parseOspfIfaces(
  raw: unknown[],
  routerIdx: number,
  errors: ParseError[],
): OspfIfaceConfig[] {
  return raw.flatMap((r, j): OspfIfaceConfig[] => {
    const obj = r as Record<string, unknown>;
    const name = (get(obj, 'name') as string | undefined) ?? '';
    if (!name) {
      errors.push({ field: `routers[${routerIdx}].interfaces[${j}].name`, message: 'required' });
      return [];
    }
    const cost = get(obj, 'cost');
    const area = (get(obj, 'area') as string | undefined) || undefined;
    const networkType = (get(obj, 'networkType', 'network_type') as string | undefined) || undefined;
    const passive = get(obj, 'passive');
    return [{
      name,
      ...(cost != null ? { cost: Number(cost) } : {}),
      ...(area ? { area } : {}),
      ...(networkType ? { networkType: networkType as 'point-to-point' | 'broadcast' } : {}),
      ...(passive != null ? { passive: Boolean(passive) } : {}),
    }];
  });
}

// ── OSPF 路由器 ───────────────────────────────────────────────────────────────

function parseOspfRouters(
  raw: unknown[],
  errors: ParseError[],
): OspfRouterConfig[] {
  return raw.flatMap((r, i): OspfRouterConfig[] => {
    const obj = r as Record<string, unknown>;
    const nodeName = (get(obj, 'nodeName', 'node_name') as string | undefined) ?? '';
    const routerId = (get(obj, 'routerId', 'router_id') as string | undefined) ?? '';
    const areas = (get(obj, 'areas') as string[] | undefined) ?? ['0.0.0.0'];
    const rawIfaces = (get(obj, 'interfaces') as unknown[] | undefined) ?? [];

    if (!nodeName) errors.push({ field: `routers[${i}].nodeName`, message: 'required' });
    if (!routerId) errors.push({ field: `routers[${i}].routerId`, message: 'required' });
    if (!nodeName || !routerId) return [];

    const interfaces = parseOspfIfaces(rawIfaces, i, errors);
    return [{ nodeName, routerId, areas, ...(interfaces.length ? { interfaces } : {}) }];
  });
}

function parseOspfConfig(obj: Record<string, unknown>): ParseResult<OspfConfig> {
  const errors: ParseError[] = [];
  const rawRouters = (obj.routers as unknown[] | undefined) ?? [];
  const referenceBandwidth = get(obj, 'referenceBandwidth', 'reference_bandwidth');

  const routers = parseOspfRouters(rawRouters, errors);
  if (routers.length === 0) errors.push({ field: 'routers', message: 'at least one router required' });

  return {
    data: errors.length === 0 ? {
      protocol: 'ospf',
      routers,
      ...(referenceBandwidth != null ? { referenceBandwidth: Number(referenceBandwidth) } : {}),
    } : null,
    errors,
  };
}

// ── IS-IS 接口配置 ────────────────────────────────────────────────────────────

const VALID_LEVELS = new Set<IsisLevel>(['L1', 'L2', 'L1L2']);

function parseIsisIfaces(
  raw: unknown[],
  routerIdx: number,
  errors: ParseError[],
): IsisIfaceConfig[] {
  return raw.flatMap((r, j): IsisIfaceConfig[] => {
    const obj = r as Record<string, unknown>;
    const name = (get(obj, 'name') as string | undefined) ?? '';
    if (!name) {
      errors.push({ field: `routers[${routerIdx}].interfaces[${j}].name`, message: 'required' });
      return [];
    }
    const metric = get(obj, 'metric');
    const circuitLevel = (get(obj, 'circuitLevel', 'circuit_level') as string | undefined) || undefined;
    if (circuitLevel && !VALID_LEVELS.has(circuitLevel as IsisLevel)) {
      errors.push({ field: `routers[${routerIdx}].interfaces[${j}].circuitLevel`, message: 'must be L1, L2, or L1L2' });
    }
    return [{
      name,
      ...(metric != null ? { metric: Number(metric) } : {}),
      ...(circuitLevel ? { circuitLevel: circuitLevel as IsisLevel } : {}),
    }];
  });
}

// ── IS-IS 路由器 ──────────────────────────────────────────────────────────────

function parseIsisRouters(raw: unknown[], errors: ParseError[]): IsisRouterConfig[] {
  return raw.flatMap((r, i): IsisRouterConfig[] => {
    const obj = r as Record<string, unknown>;
    const nodeName = (get(obj, 'nodeName', 'node_name') as string | undefined) ?? '';
    const systemId = (get(obj, 'systemId', 'system_id') as string | undefined) ?? '';
    const level = ((get(obj, 'level') as string | undefined) ?? 'L2') as IsisLevel;
    const rawIfaces = (get(obj, 'interfaces') as unknown[] | undefined) ?? [];

    if (!nodeName) errors.push({ field: `routers[${i}].nodeName`, message: 'required' });
    if (!systemId) errors.push({ field: `routers[${i}].systemId`, message: 'required' });
    if (!VALID_LEVELS.has(level)) errors.push({ field: `routers[${i}].level`, message: 'must be L1, L2, or L1L2' });
    if (!nodeName || !systemId) return [];

    const interfaces = parseIsisIfaces(rawIfaces, i, errors);
    return [{ nodeName, systemId, level, ...(interfaces.length ? { interfaces } : {}) }];
  });
}

function parseIsisConfig(obj: Record<string, unknown>): ParseResult<IsisConfig> {
  const errors: ParseError[] = [];
  const rawRouters = (obj.routers as unknown[] | undefined) ?? [];
  const defaultMetric = get(obj, 'defaultMetric', 'default_metric');

  const routers = parseIsisRouters(rawRouters, errors);
  if (routers.length === 0) errors.push({ field: 'routers', message: 'at least one router required' });

  return {
    data: errors.length === 0 ? {
      protocol: 'isis',
      routers,
      ...(defaultMetric != null ? { defaultMetric: Number(defaultMetric) } : {}),
    } : null,
    errors,
  };
}

// ── 入口 ─────────────────────────────────────────────────────────────────────

export function parseProtocolConfig(json: unknown): ParseResult<ProtocolConfig> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { data: null, errors: [{ field: 'root', message: 'must be a JSON object' }] };
  }

  const obj = json as Record<string, unknown>;
  const protocol = obj.protocol as string | undefined;
  const errors: ParseError[] = [];
  const config: ProtocolConfig = {};

  if (protocol === 'ospf' || 'ospf' in obj) {
    const target = ('ospf' in obj ? obj.ospf : obj) as Record<string, unknown>;
    const result = parseOspfConfig(target);
    errors.push(...result.errors);
    if (result.data) config.ospf = result.data;
  }

  if (protocol === 'isis' || 'isis' in obj) {
    const target = ('isis' in obj ? obj.isis : obj) as Record<string, unknown>;
    const result = parseIsisConfig(target);
    errors.push(...result.errors);
    if (result.data) config.isis = result.data;
  }

  if (!config.ospf && !config.isis && errors.length === 0) {
    errors.push({ field: 'protocol', message: 'must be "ospf" or "isis", or contain ospf/isis keys' });
  }

  return { data: errors.length === 0 ? config : null, errors };
}

/**
 * 交叉校验：确认配置里引用的 nodeName 都存在于当前拓扑中。
 */
export function validateConfigAgainstTopo(
  config: ProtocolConfig,
  nodeNames: Set<string>,
): ParseError[] {
  const errors: ParseError[] = [];

  config.ospf?.routers.forEach((r, i) => {
    if (!nodeNames.has(r.nodeName))
      errors.push({ field: `ospf.routers[${i}].nodeName`, message: `"${r.nodeName}" not found in topology` });
  });

  config.isis?.routers.forEach((r, i) => {
    if (!nodeNames.has(r.nodeName))
      errors.push({ field: `isis.routers[${i}].nodeName`, message: `"${r.nodeName}" not found in topology` });
  });

  return errors;
}
