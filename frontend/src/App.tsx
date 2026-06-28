import { useState, useEffect, useCallback } from 'react';
import PackList from './components/PackList';
import Player from './components/Player';
import SessionsDashboard from './components/SessionsDashboard';
import { Pack } from './types';
import { flushSessionQueue } from './lib/session';
import { getAllInstalledPacks, getAllQueuedSessions } from './lib/idb';
import { getTotalFailedCount, getAllFailedPackIds, installPack } from './lib/installer';
import { getPack } from './lib/idb';

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
  const [_queuedCount, setQueuedCount] = useState(0);
  const [failedDownloads, setFailedDownloads] = useState(0);
  const [retrying, setRetrying] = useState(false);

  async function refreshQueueCount() {
    const q = await getAllQueuedSessions();
    setQueuedCount(q.length);
  }

  function refreshFailedCount() {
    setFailedDownloads(getTotalFailedCount());
  }

  async function handleRetryAllFailed(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isOnline || retrying) return;
    setRetrying(true);
    const packIds = getAllFailedPackIds();
    for (const packId of packIds) {
      try {
        const cached = await getPack(packId);
        const pack = cached ?? await fetch(`${API_URL}/api/packs/${packId}`).then(r => r.json());
        await installPack(pack, pack.blocks || [], (p) => {
          if (p.status === 'done') refreshFailedCount();
        });
      } catch {}
    }
    refreshFailedCount();
    setRetrying(false);
  }

  async function loadPacks(online: boolean, restorePosition = false) {
    setLoading(true);
    if (online) {
      try {
        const res = await fetch(`${API_URL}/api/packs`);
        const data = await res.json();
        setPacks(data);
        if (restorePosition) restoreLastPosition(data);
      } catch {
        setIsOnline(false);
        const data = await getAllInstalledPacks();
        setPacks(data);
        if (restorePosition) restoreLastPosition(data);
      }
    } else {
      const data = await getAllInstalledPacks();
      setPacks(data);
      if (restorePosition) restoreLastPosition(data);
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

  async function goHome() {
    clearLastPosition();
    setSelectedPack(null);
    setInitialBlockId(null);
    // Re-probe on home to catch offline→online transitions
    const online = await probeOnline();
    if (online !== isOnline) setIsOnline(online);
    if (online) {
      await flushSessionQueue();
      loadPacks(true);
      refreshQueueCount();
    } else if (isOnline !== online) {
      loadPacks(false);
    }
  }

  useEffect(() => {
    probeOnline().then(async online => {
      setIsOnline(online);
      if (online) await flushSessionQueue();
      loadPacks(online, true); // restore position only on initial mount
      refreshQueueCount();
      refreshFailedCount();
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

    // Poll every 5s when offline to catch reconnection (DevTools + real network)
    const poll = setInterval(async () => {
      if (navigator.onLine === false) return; // definitely offline, skip probe
      const online = await probeOnline();
      setIsOnline(prev => {
        if (online && !prev) {
          flushSessionQueue().then(refreshQueueCount);
          loadPacks(true);
        }
        return online !== prev ? online : prev;
      });
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(poll);
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
          {/* Failed downloads — retry all from header */}
          {failedDownloads > 0 && isOnline && (
            <button
              onClick={handleRetryAllFailed}
              disabled={retrying}
              className="text-xs px-2 py-1 rounded-full bg-amber-900/50 text-amber-300 hover:bg-amber-800/60 disabled:opacity-50 transition-colors"
            >
              <i className={`fa-solid fa-rotate mr-1 ${retrying ? 'animate-spin' : ''}`} />
              {failedDownloads} failed
            </button>
          )}
          {failedDownloads > 0 && !isOnline && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-900/50 text-amber-300 font-mono">
              ⚠ {failedDownloads} failed
            </span>
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
              onProgressChange={refreshFailedCount}
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
