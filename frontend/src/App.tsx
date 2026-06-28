import { useState, useEffect, useCallback } from 'react';
import PackList from './components/PackList';
import Player from './components/Player';
import SessionsDashboard from './components/SessionsDashboard';
import { Pack } from './types';
import { flushSessionQueue } from './lib/session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  // Online/offline detection + sync flush
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      await flushSessionQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch packs from backend (only when online)
  useEffect(() => {
    if (!isOnline) { setLoading(false); return; }
    fetch(`${API_URL}/api/packs`)
      .then(r => r.json())
      .then(data => { setPacks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isOnline]);

  // iOS audio unlock on first tap
  const handleUnlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    const audio = new Audio();
    audio.play().catch(() => {});
    setAudioUnlocked(true);
  }, [audioUnlocked]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100" onClick={handleUnlockAudio}>
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Offline Audio Guide</h1>
          <p className="text-xs text-gray-500 mt-0.5">Works without internet after install</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Online/offline badge */}
          <span className={`text-xs px-2 py-1 rounded-full font-mono ${isOnline ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {isOnline ? '● online' : '● offline'}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {selectedPack ? (
          <Player
            pack={selectedPack}
            onBack={() => setSelectedPack(null)}
            isOnline={isOnline}
          />
        ) : (
          <>
            <PackList
              packs={packs}
              loading={loading}
              isOnline={isOnline}
              onSelect={setSelectedPack}
            />
            <div className="mt-12">
              <SessionsDashboard isOnline={isOnline} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
