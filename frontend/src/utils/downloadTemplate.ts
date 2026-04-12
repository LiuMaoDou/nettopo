/** Trigger a browser download of a file by blob content. */
function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── JSON template (JSONC — supports // comments, stripped before parsing) ────

const TEMPLATE_JSONC = `{
  "nodes": [
    {
      "nodeName": "Core-Router-1",       // 必填 — 设备名称（同时作为 ID 来源）
      "type": "router",                  // 可选 — router | switch | firewall | server | ap | endpoint，默认 router
      "vendor": "Cisco",                 // 可选
      "model": "ASR9000",                // 可选
      "group": "Core",                   // 可选 — 分组名称，相同值的节点归为一组；不填默认 default（不显示分组）
      "status": "up"                     // 可选 — up | down | warning，默认 up
    },
    { "nodeName": "Core-Router-2",  "type": "router",   "vendor": "Cisco",     "model": "ASR9000",        "group": "Core",         "status": "up"      },
    { "nodeName": "Firewall-1",     "type": "firewall", "vendor": "Palo Alto", "model": "PA-3220",        "group": "DMZ",          "status": "up"      },
    { "nodeName": "Dist-SW-1",      "type": "switch",   "vendor": "Juniper",   "model": "EX4300",         "group": "Distribution", "status": "up"      },
    { "nodeName": "Access-SW-1",    "type": "switch",   "vendor": "Juniper",   "model": "EX2300",         "group": "Floor2",       "status": "warning" },
    { "nodeName": "AP-Floor2-01",   "type": "ap",       "vendor": "Aruba",     "model": "AP-515",         "group": "Floor2",       "status": "up"      },
    { "nodeName": "App-Server-1",   "type": "server",   "vendor": "Dell",      "model": "PowerEdge R750", "group": "Servers",      "status": "up"      },
    { "nodeName": "Workstation-01", "type": "endpoint", "vendor": "",          "model": "",               "group": "Floor2",       "status": "down"    }
  ],
  "edges": [
    {
      "src": {
        "nodeName": "Core-Router-1",       // 必填 — 对应 nodes[].nodeName
        "interface": "Gi0/1",              // 可选 — 接口名
        "ipv4Address": "10.0.0.1",         // 可选 — IPv4 地址
        "ipv4Mask": "255.255.255.252",     // 可选 — IPv4 掩码
        "ipv6Address": "2001:db8::1",      // 可选 — IPv6 地址
        "ipv6Mask": "64",                  // 可选 — IPv6 前缀长度
        "utilizationOut": 0.32,            // 可选 — 0~1，出方向利用率
        "bandwidth": 100,                  // 可选 — Gbps
        "status": "up"                     // 可选 — up | down，默认 up
      },
      "dst": {                             // 字段同 src
        "nodeName": "Core-Router-2",
        "interface": "Gi0/2",
        "ipv4Address": "10.0.0.2",
        "ipv4Mask": "255.255.255.252",
        "ipv6Address": "2001:db8::2",
        "ipv6Mask": "64",
        "utilizationOut": 0.18,
        "bandwidth": 100,
        "status": "up"
      }
    },
    { "src": { "nodeName": "Core-Router-1", "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.55, "bandwidth": 10,  "status": "up"   }, "dst": { "nodeName": "Firewall-1",    "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.42, "bandwidth": 10,  "status": "up"   } },
    { "src": { "nodeName": "Core-Router-1", "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.71, "bandwidth": 10,  "status": "up"   }, "dst": { "nodeName": "Dist-SW-1",     "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.60, "bandwidth": 10,  "status": "up"   } },
    { "src": { "nodeName": "Dist-SW-1",     "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.88, "bandwidth": 1,   "status": "up"   }, "dst": { "nodeName": "Access-SW-1",   "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.75, "bandwidth": 1,   "status": "up"   } },
    { "src": { "nodeName": "Access-SW-1",   "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.20, "bandwidth": 1,   "status": "up"   }, "dst": { "nodeName": "AP-Floor2-01",  "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.05, "bandwidth": 1,   "status": "up"   } },
    { "src": { "nodeName": "Access-SW-1",   "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0,    "bandwidth": 1,   "status": "down" }, "dst": { "nodeName": "Workstation-01","interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0,    "bandwidth": 1,   "status": "down" } },
    { "src": { "nodeName": "Core-Router-2", "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.45, "bandwidth": 10,  "status": "up"   }, "dst": { "nodeName": "App-Server-1",  "interface": "", "ipv4Address": "", "ipv4Mask": "", "ipv6Address": "", "ipv6Mask": "", "utilizationOut": 0.38, "bandwidth": 10,  "status": "up"   } }
  ]
}`;

/** Download the topology import template as JSON (supports // comments). */
export function downloadTemplateJSON(): void {
  triggerDownload(TEMPLATE_JSONC, 'topology-template.json', 'application/json');
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

const DEVICES_HEADER =
  'nodeName,type,vendor,model,group,status';

const LINKS_HEADER =
  'source,target,status,bandwidth,' +
  'srcInterface,srcIpv4Address,srcIpv4Mask,srcIpv6Address,srcIpv6Mask,srcUtilizationOut,' +
  'dstInterface,dstIpv4Address,dstIpv4Mask,dstIpv6Address,dstIpv6Mask,dstUtilizationOut';

function row(...fields: (string | number | undefined)[]): string {
  return fields.map((f) => f ?? '').join(',');
}

const DEVICES_CSV = [
  DEVICES_HEADER,
  row('Core-Router-1',  'router',   'Cisco',     'ASR9000',        'Core',         'up'),
  row('Core-Router-2',  'router',   'Cisco',     'ASR9000',        'Core',         'up'),
  row('Firewall-1',     'firewall', 'Palo Alto', 'PA-3220',        'DMZ',          'up'),
  row('Dist-SW-1',      'switch',   'Juniper',   'EX4300',         'Distribution', 'up'),
  row('Access-SW-1',    'switch',   'Juniper',   'EX2300',         'Floor2',       'warning'),
  row('AP-Floor2-01',   'ap',       'Aruba',     'AP-515',         'Floor2',       'up'),
  row('App-Server-1',   'server',   'Dell',      'PowerEdge R750', 'Servers',      'up'),
  row('Workstation-01', 'endpoint', '',          '',               'Floor2',       'down'),
].join('\n');

//                      src,  dst,  st,    bw,  srcIf,      srcIp4,       srcMask4,              srcIp6,        srcMask6, srcUtil, dstIf,      dstIp4,       dstMask4,              dstIp6,        dstMask6, dstUtil
const LINKS_CSV = [
  LINKS_HEADER,
  row('Core-Router-1', 'Core-Router-2', 'up',  100, 'Gi0/1', '10.0.0.1', '255.255.255.252', '2001:db8::1', '64', 0.32, 'Gi0/2', '10.0.0.2', '255.255.255.252', '2001:db8::2', '64', 0.18),
  row('Core-Router-1', 'Firewall-1',    'up',   10, '', '', '', '', '', 0.55, '', '', '', '', '', 0.42),
  row('Core-Router-1', 'Dist-SW-1',     'up',   10, '', '', '', '', '', 0.71, '', '', '', '', '', 0.60),
  row('Dist-SW-1',     'Access-SW-1',   'up',    1, '', '', '', '', '', 0.88, '', '', '', '', '', 0.75),
  row('Access-SW-1',   'AP-Floor2-01',  'up',    1, '', '', '', '', '', 0.20, '', '', '', '', '', 0.05),
  row('Access-SW-1',   'Workstation-01','down',  1, '', '', '', '', '', 0,    '', '', '', '', '', 0),
  row('Core-Router-2', 'App-Server-1',  'up',   10, '', '', '', '', '', 0.45, '', '', '', '', '', 0.38),
].join('\n');

/** Download devices template as CSV. */
export function downloadTemplateDevicesCSV(): void {
  triggerDownload(DEVICES_CSV, 'topology-template-devices.csv', 'text/csv');
}

/** Download links template as CSV. */
export function downloadTemplateLinksCSV(): void {
  triggerDownload(LINKS_CSV, 'topology-template-links.csv', 'text/csv');
}
