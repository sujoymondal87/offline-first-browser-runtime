import { useState, useEffect, useCallback } from 'react';
import PackList from './components/PackList';
import Player from './components/Player';
import SessionsDashboard from './components/SessionsDashboard';
import { Pack } from './types';
import { flushSessionQueue } from './lib/session';
import { getAllInstalledPacks } from './lib/idb';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function probeOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export default function App() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  async function loadPacks(online: boolean) {
    setLoading(true);
    if (online) {
      try {
        const res = await fetch(`${API_URL}/api/packs`);
        const data = await res.json();
        setPacks(data);
      } catch {
        // fetch failed — fall back to IDB
        setIsOnline(false);
        const data = await getAllInstalledPacks();
        setPacks(data);
      }
    } else {
      const data = await getAllInstalledPacks();
      setPacks(data);
    }
    setLoading(false);
  }

  // Probe on mount — source of truth for initial online state
  useEffect(() => {
    probeOnline().then(online => {
      setIsOnline(online);
      loadPacks(online);
    });

    const handleOnline = () => probeOnline().then(async online => {
      setIsOnline(online);
      if (online) {
        await flushSessionQueue();
        loadPacks(true);
      }
    });
    const handleOffline = () => { setIsOnline(false); loadPacks(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleUnlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    new Audio().play().catch(() => {});
    setAudioUnlocked(true);
  }, [audioUnlocked]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100" onClick={handleUnlockAudio}>
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div
          className={selectedPack ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}
          onClick={() => selectedPack && setSelectedPack(null)}
        >
          <h1 className="text-lg font-semibold tracking-tight">Offline Audio Guide</h1>
          <p className="text-xs text-gray-500 mt-0.5">Works without internet after install</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded-full font-mono ${isOnline ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {isOnline ? '● online' : '● offline'}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {selectedPack ? (
          <>
            <Player pack={selectedPack} onBack={() => setSelectedPack(null)} isOnline={isOnline} />
            <div className="mt-12">
              <SessionsDashboard isOnline={isOnline} packId={selectedPack.id} />
            </div>
          </>
        ) : (
          <>
            <PackList packs={packs} loading={loading} isOnline={isOnline} onSelect={setSelectedPack} />
            <div className="mt-12">
              <SessionsDashboard isOnline={isOnline} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
