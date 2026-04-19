import { useRef, useState, useEffect } from 'react';
import { useTopoStore } from '../store/topoStore';
import { graphRegistry } from '../store/graphRegistry';
import { LAYOUT_OPTIONS } from '../layouts';
import type { LayoutType } from '../types/topo';
import { parseJSON, parseDevicesCSV } from '../utils/dataParser';
import { exportToPNG } from '../utils/exportGraph';
import { generateRoutingDemo } from '../utils/mockData';
import {
  downloadTemplateLinksCSV,
  downloadOspfTemplate,
  downloadIsisTemplate,
  downloadInterfaceListTemplate,
} from '../utils/downloadTemplate';
import { parseInterfaceList } from '../utils/interfaceParser';
import { parseProtocolConfig, validateConfigAgainstTopo } from '../utils/protocolParser';

const DEMO_OPTIONS: { label: string; scale: 'small' | 'medium' | 'large' }[] = [
  { label: '20 台 (Small)',   scale: 'small'  },
  { label: '200 台 (Medium)', scale: 'medium' },
  { label: '1500 台 (Large)', scale: 'large'  },
];

export default function Toolbar() {
  const { currentLayout, setLayout, loadMockData, setTopologyData, showPortLabels, togglePortLabels, showCostLabels, toggleCostLabels, topologyData, protocolConfig, setProtocolConfig, clearRoutingResult } = useTopoStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const protocolFileInputRef = useRef<HTMLInputElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!demoOpen && !templateOpen) return;
    const handle = (e: MouseEvent) => {
      if (demoRef.current && !demoRef.current.contains(e.target as Node)) {
        setDemoOpen(false);
      }
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setTemplateOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [demoOpen, templateOpen]);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      try {
        if (file.name.endsWith('.json')) {
          // 自动识别格式：平铺数组 或 { interfaces: [...] } → 接口列表推导；否则 → 标准拓扑 JSON
          let parsed: unknown;
          try { parsed = JSON.parse(content); } catch { parsed = null; }
          if (
            Array.isArray(parsed) ||
            (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).interfaces))
          ) {
            setTopologyData(parseInterfaceList(content));
          } else {
            setTopologyData(parseJSON(content));
          }
        } else if (file.name.endsWith('.csv')) {
          const nodes = parseDevicesCSV(content);
          setTopologyData({ nodes, edges: [] });
        }
      } catch (err) {
        alert(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = async () => {
    const graph = graphRegistry.get();
    if (graph) {
      await exportToPNG(graph as Parameters<typeof exportToPNG>[0]);
    }
  };

  const handleProtocolImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      try {
        const json = JSON.parse(content);
        const result = parseProtocolConfig(json);
        if (!result.data) {
          const msgs = result.errors.map((er) => `${er.field}: ${er.message}`).join('\n');
          alert(`协议配置解析失败:\n${msgs}`);
          return;
        }
        // 交叉校验：确认 nodeName 在当前拓扑中存在
        if (topologyData) {
          const nodeNames = new Set(topologyData.nodes.map((n) => n.nodeName));
          const crossErrors = validateConfigAgainstTopo(result.data, nodeNames);
          if (crossErrors.length > 0) {
            const msgs = crossErrors.map((er) => `${er.field}: ${er.message}`).join('\n');
            alert(`协议配置与拓扑不匹配:\n${msgs}`);
            return;
          }
        }
        setProtocolConfig(result.data);
      } catch (err) {
        alert(`协议配置导入失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
      {/* Layout selector */}
      <select
        value={currentLayout}
        onChange={(e) => setLayout(e.target.value as LayoutType)}
        className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm border border-gray-600 cursor-pointer"
      >
        {LAYOUT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* DEMO dropdown */}
      <div ref={demoRef} className="relative">
        <button
          onClick={() => setDemoOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors select-none"
        >
          DEMO
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${demoOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.8"
          >
            <polyline points="1,1 5,5 9,1" />
          </svg>
        </button>

        {demoOpen && (
          <div className="absolute left-0 mt-1 w-44 rounded bg-gray-800 border border-gray-600 shadow-lg overflow-hidden">
            {DEMO_OPTIONS.map((opt) => (
              <button
                key={opt.scale}
                onClick={() => { loadMockData(opt.scale); setDemoOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
              >
                {opt.label}
              </button>
            ))}
            <div className="border-t border-gray-700" />
            <button
              onClick={() => {
                const { topology, protocolConfig } = generateRoutingDemo();
                setTopologyData(topology);
                setProtocolConfig(protocolConfig);
                clearRoutingResult();
                setDemoOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-indigo-400 hover:bg-gray-700 transition-colors"
            >
              路由演示
            </button>
          </div>
        )}
      </div>

      {/* Template download dropdown */}
      <div ref={templateRef} className="relative">
        <button
          onClick={() => setTemplateOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors select-none"
        >
          导入模板
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${templateOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.8"
          >
            <polyline points="1,1 5,5 9,1" />
          </svg>
        </button>

        {templateOpen && (
          <div className="absolute left-0 mt-1 w-52 rounded bg-gray-800 border border-gray-600 shadow-lg overflow-hidden">
            <div className="px-4 py-1.5 text-xs text-gray-500">拓扑</div>
            <button
              onClick={() => { downloadInterfaceListTemplate(); setTemplateOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
            >
              导入模板
              <span className="ml-1 text-gray-400 text-xs">(.json)</span>
            </button>
            <div className="border-t border-gray-700" />
            <div className="px-4 py-1.5 text-xs text-gray-500">CSV</div>
            <button
              onClick={() => { downloadTemplateLinksCSV(); setTemplateOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
            >
              链路模板
              <span className="ml-1 text-gray-400 text-xs">(.csv)</span>
            </button>
            <div className="border-t border-gray-700" />
            <div className="px-4 py-1.5 text-xs text-gray-500">协议配置</div>
            <button
              onClick={() => { downloadOspfTemplate(); setTemplateOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
            >
              OSPF 模板
              <span className="ml-1 text-gray-400 text-xs">(.json)</span>
            </button>
            <button
              onClick={() => { downloadIsisTemplate(); setTemplateOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
            >
              IS-IS 模板
              <span className="ml-1 text-gray-400 text-xs">(.json)</span>
            </button>
            <div className="border-t border-gray-700" />
            <button
              onClick={() => { setTemplateOpen(false); protocolFileInputRef.current?.click(); }}
              className="w-full text-left px-4 py-2 text-sm text-indigo-400 hover:bg-gray-700 transition-colors"
            >
              导入协议配置
              <span className="ml-1 text-gray-500 text-xs">(.json)</span>
            </button>
          </div>
        )}
      </div>

      {/* Import */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors"
      >
        导入
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        className="hidden"
        onChange={handleFileImport}
      />

      {/* Toggle port labels */}
      <button
        onClick={togglePortLabels}
        title={showPortLabels ? '隐藏接口信息' : '显示接口信息'}
        className={`px-3 py-1.5 rounded text-sm transition-colors ${
          showPortLabels
            ? 'bg-indigo-600 text-white hover:bg-indigo-500'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`}
      >
        接口信息
      </button>

      {/* Toggle cost labels — only shown when a protocol config is loaded */}
      {protocolConfig && (
        <button
          onClick={toggleCostLabels}
          title={showCostLabels ? '隐藏接口Cost' : '显示接口Cost'}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            showCostLabels
              ? 'bg-indigo-600 text-white hover:bg-indigo-500'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          接口Cost
        </button>
      )}

      {/* Import protocol config */}
      <button
        onClick={() => protocolFileInputRef.current?.click()}
        className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors"
        title="导入 OSPF / IS-IS 协议配置 JSON"
      >
        导入协议
      </button>
      <input
        ref={protocolFileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleProtocolImport}
      />

      {/* Export PNG */}
      <button
        onClick={handleExport}
        className="px-3 py-1.5 rounded bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors"
      >
        导出 PNG
      </button>
    </div>
  );
}
