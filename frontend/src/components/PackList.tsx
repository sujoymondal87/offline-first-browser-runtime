import { useEffect, useState } from 'react';
import { Pack } from '../types';
import { getInstallState } from '../lib/idb';
import { getFailedAssets } from '../lib/installer';

interface Props {
  packs: Pack[];
  loading: boolean;
  isOnline: boolean;
  onSelect: (pack: Pack) => void;
}

export default function PackList({ packs, loading, isOnline, onSelect }: Props) {
  const [installStates, setInstallStates] = useState<Record<string, boolean>>({});
  const [failedCounts, setFailedCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    packs.forEach(async (pack) => {
      const state = await getInstallState(pack.id);
      if (state?.installed) {
        setInstallStates(prev => ({ ...prev, [pack.id]: true }));
      }
      const failed = getFailedAssets(pack.id);
      if (failed.length > 0) {
        setFailedCounts(prev => ({ ...prev, [pack.id]: failed.length }));
      }
    });
  }, [packs]);

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500">
        <div className="text-2xl mb-2">⟳</div>
        <p className="text-sm">Loading guides...</p>
      </div>
    );
  }

  if (!isOnline && packs.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <div className="text-3xl mb-3">📡</div>
        <p className="text-sm">You're offline. Connect to browse guides.</p>
        <p className="text-xs mt-1 text-gray-600">Previously installed guides are still available.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-4">Available Guides</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {packs.map(pack => (
          <button
            key={pack.id}
            onClick={() => onSelect(pack)}
            className="text-left border border-gray-800 rounded-lg p-5 hover:border-gray-600 transition-colors bg-gray-900"
          >
            {pack.cover_image_url && (
              <img src={pack.cover_image_url} alt="" className="w-full h-32 object-cover rounded mb-3 opacity-80" />
            )}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-medium text-gray-100">{pack.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{pack.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {installStates[pack.id] && (
                  <span className="text-xs text-green-400 bg-green-900/40 px-2 py-0.5 rounded-full">✓ installed</span>
                )}
                {failedCounts[pack.id] > 0 && (
                  <span className="text-xs text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded-full">
                    ⚠ {failedCounts[pack.id]} pending
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
