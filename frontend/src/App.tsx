import './styles/globals.css';
import TopologyCanvas from './components/TopologyCanvas';
import Toolbar from './components/Toolbar';
import DevicePanel from './components/DevicePanel';
import SearchBar from './components/SearchBar';
import StatusBar from './components/StatusBar';

function EdgeLegend() {
  return (
    <div className="absolute bottom-10 left-4 z-10 px-3 py-2 rounded bg-gray-900 border border-gray-700 text-xs text-gray-400 space-y-1 select-none">
      <div className="text-gray-300 font-medium mb-1">链路标签说明</div>
      <div><span className="text-gray-200">Port(x%)</span> — 接口名(出方向利用率)</div>
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-slate-400">源端</span>
        <span className="border-t border-dashed border-gray-500 flex-1" />
        <span className="text-slate-400">目标端</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="relative w-screen h-screen bg-gray-950 overflow-hidden">
      <Toolbar />
      <SearchBar />
      <TopologyCanvas />
      <DevicePanel />
      <StatusBar />
      <EdgeLegend />
    </div>
  );
}
