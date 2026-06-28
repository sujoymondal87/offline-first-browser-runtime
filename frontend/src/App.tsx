import { useState, useEffect, useCallback } from 'react';
import PackList from './components/PackList';
import Player from './components/Player';
import SessionsDashboard from './components/SessionsDashboard';
import { Pack } from './types';
import { flushSessionQueue } from './lib/session';
import { getAllInstalledPacks, getAllQueuedSessions } from './lib/idb';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const LAST_POSITION_KEY = 'offline_guide_last_position';

function saveLastPosition(packId: string, blockId: string) {
  localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ packId, blockId }));
}
function clearLastPosition() {
  localStorage.removeItem(LAST_POSITION_KEY);
}
function getLastPosition(): { packId: string; blockId: string } | null {
  try {
    const raw = localStorage.getItem(LAST_POSITION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

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
  const [initialBlockId, setInitialBlockId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refreshQueueCount() {
    const q = await getAllQueuedSessions();
    setQueuedCount(q.length);
  }

  async function handleSync(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isOnline || syncing) return;
    setSyncing(true);
    await flushSessionQueue();
    await refreshQueueCount();
    setSyncing(false);
  }

  async function loadPacks(online: boolean) {
    setLoading(true);
    if (online) {
      try {
        const res = await fetch(`${API_URL}/api/packs`);
        const data = await res.json();
        setPacks(data);
        restoreLastPosition(data);
      } catch {
        setIsOnline(false);
        const data = await getAllInstalledPacks();
        setPacks(data);
        restoreLastPosition(data);
      }
    } else {
      const data = await getAllInstalledPacks();
      setPacks(data);
      restoreLastPosition(data);
    }
    setLoading(false);
  }

  function restoreLastPosition(loadedPacks: Pack[]) {
    const last = getLastPosition();
    if (!last) return;
    const pack = loadedPacks.find(p => p.id === last.packId);
    if (pack) {
      setSelectedPack(pack);
      setInitialBlockId(last.blockId);
    }
  }

  function goHome() {
    clearLastPosition();
    setSelectedPack(null);
    setInitialBlockId(null);
    if (isOnline) flushSessionQueue().then(refreshQueueCount);
  }

  useEffect(() => {
    probeOnline().then(async online => {
      setIsOnline(online);
      if (online) await flushSessionQueue();
      loadPacks(online);
      refreshQueueCount();
    });

    const handleOnline = () => probeOnline().then(async online => {
      setIsOnline(online);
      if (online) {
        await flushSessionQueue();
        loadPacks(true);
        refreshQueueCount();
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

  // Refresh queue count whenever block changes (trackEvent queues to IDB)
  const handlePositionChange = useCallback((packId: string, blockId: string) => {
    saveLastPosition(packId, blockId);
    refreshQueueCount();
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
          onClick={() => selectedPack && goHome()}
        >
          <h1 className="text-lg font-semibold tracking-tight">Offline Audio Guide</h1>
          <p className="text-xs text-gray-500 mt-0.5">Works without internet after install</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync button — visible when there are queued sessions */}
          {queuedCount > 0 && (
            <button
              onClick={handleSync}
              disabled={!isOnline || syncing}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-amber-900/50 text-amber-300 hover:bg-amber-800/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={isOnline ? 'Sync now' : 'Will sync when online'}
            >
              <i className={`fa-solid fa-rotate ${syncing ? 'animate-spin' : ''}`} />
              {queuedCount} pending
            </button>
          )}
          <span className={`text-xs px-2 py-1 rounded-full font-mono ${isOnline ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {isOnline ? '● online' : '● offline'}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {selectedPack ? (
          <>
            <Player
              pack={selectedPack}
              onBack={goHome}
              isOnline={isOnline}
              initialBlockId={initialBlockId}
              onPositionChange={handlePositionChange}
            />
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
