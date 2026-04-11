import { useState, useCallback } from 'react';
import { useTopoStore } from '../store/topoStore';

/**
 * Search bar for filtering nodes by IP, label, or group.
 * Updates the store searchQuery which triggers highlight logic in TopologyCanvas.
 */
export default function SearchBar() {
  const [query, setQuery] = useState('');
  const { setSearchQuery } = useTopoStore();

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSearchQuery(value);
    },
    [setSearchQuery]
  );

  return (
    <div className="absolute top-4 right-4 z-10">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="搜索 IP / 设备名 / VLAN..."
        className="w-64 px-3 py-1.5 rounded bg-gray-800 text-white text-sm border border-gray-600 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
