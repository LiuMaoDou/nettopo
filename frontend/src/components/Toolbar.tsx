import { useRef, useState, useEffect } from 'react';
import { useTopoStore } from '../store/topoStore';
import { graphRegistry } from '../store/graphRegistry';
import { LAYOUT_OPTIONS } from '../layouts';
import type { LayoutType } from '../types/topo';
import { parseJSON, parseDevicesCSV } from '../utils/dataParser';
import { exportToPNG } from '../utils/exportGraph';
import {
  downloadTemplateJSON,
  downloadTemplateDevicesCSV,
  downloadTemplateLinksCSV,
} from '../utils/downloadTemplate';

const DEMO_OPTIONS: { label: string; scale: 'small' | 'medium' | 'large' }[] = [
  { label: '20 台 (Small)',   scale: 'small'  },
  { label: '200 台 (Medium)', scale: 'medium' },
  { label: '1500 台 (Large)', scale: 'large'  },
];

export default function Toolbar() {
  const { currentLayout, setLayout, loadMockData, setTopologyData } = useTopoStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
          setTopologyData(parseJSON(content));
        } else if (file.name.endsWith('.csv')) {
          const nodes = parseDevicesCSV(content);
          setTopologyData({ nodes, edges: [], groups: [] });
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
            <button
              onClick={() => { downloadTemplateJSON(); setTemplateOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
            >
              JSON 模板
              <span className="ml-1 text-gray-400 text-xs">(.json)</span>
            </button>
            <div className="border-t border-gray-700" />
            <div className="px-4 py-1.5 text-xs text-gray-500">CSV（需两个文件）</div>
            <button
              onClick={() => { downloadTemplateDevicesCSV(); setTemplateOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
            >
              设备模板
              <span className="ml-1 text-gray-400 text-xs">(.csv)</span>
            </button>
            <button
              onClick={() => { downloadTemplateLinksCSV(); setTemplateOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
            >
              链路模板
              <span className="ml-1 text-gray-400 text-xs">(.csv)</span>
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
