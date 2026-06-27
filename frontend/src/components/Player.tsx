import { useState, useEffect, useRef } from 'react';
import { Pack, Block, DownloadProgress } from '../types';
import { retrieveBlob, getInstallState, getPack } from '../lib/idb';
import { installPack } from '../lib/installer';
import { trackEvent } from '../lib/session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Props {
  pack: Pack;
  onBack: () => void;
  isOnline: boolean;
}

export default function Player({ pack, onBack, isOnline }: Props) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [currentBlock, setCurrentBlock] = useState<Block | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Load pack — from IDB if installed, from API if online
  useEffect(() => {
    async function load() {
      const state = await getInstallState(pack.id);
      if (state?.installed) {
        const cached = await getPack(pack.id);
        if (cached?.blocks) {
          setBlocks(cached.blocks);
          setCurrentBlock(cached.blocks[0]);
          setIsInstalled(true);
          setLoading(false);
          return;
        }
      }

      if (isOnline) {
        try {
          const res = await fetch(`${API_URL}/api/packs/${pack.id}`);
          const data = await res.json();
          setBlocks(data.blocks || []);
          setCurrentBlock(data.blocks?.[0] || null);
        } catch {}
      }
      setLoading(false);
    }
    load();
  }, [pack.id, isOnline]);

  // Load audio/media blobs when block changes
  useEffect(() => {
    if (!currentBlock || !isInstalled) return;

    // Revoke previous blob URLs
    if (audioSrc?.startsWith('blob:')) URL.revokeObjectURL(audioSrc);
    if (mediaSrc?.startsWith('blob:')) URL.revokeObjectURL(mediaSrc);

    setAudioSrc(null);
    setMediaSrc(null);

    if (currentBlock.audio_url) {
      retrieveBlob('audio_chunks', currentBlock.id).then(blob => {
        if (blob) setAudioSrc(URL.createObjectURL(blob));
      });
    }

    if (currentBlock.media_url) {
      retrieveBlob('media_chunks', currentBlock.id).then(blob => {
        if (blob) setMediaSrc(URL.createObjectURL(blob));
      });
    }

    // Track started event
    trackEvent(pack.id, currentBlock.id, 'started');
  }, [currentBlock?.id, isInstalled]);

  async function handleInstall() {
    if (!isOnline) return;
    const res = await fetch(`${API_URL}/api/packs/${pack.id}`);
    const data = await res.json();
    setBlocks(data.blocks || []);

    await installPack(data, data.blocks || [], (p) => {
      setProgress(p);
      if (p.status === 'done') {
        setIsInstalled(true);
        setCurrentBlock(data.blocks?.[0] || null);
        trackEvent(pack.id, data.blocks?.[0]?.id || '', 'installed');
      }
    });
  }

  function goNext() {
    if (!currentBlock?.next_id) return;
    const next = blocks.find(b => b.id === currentBlock.next_id);
    if (next) {
      trackEvent(pack.id, currentBlock.id, 'completed');
      setCurrentBlock(next);
    }
  }

  function goBack() {
    if (!currentBlock?.parent_id) return;
    const parent = blocks.find(b => b.id === currentBlock.parent_id);
    if (parent) setCurrentBlock(parent);
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>;
  }

  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 mb-6 flex items-center gap-1">
        ← All guides
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{pack.title}</h2>
          <p className="text-xs text-gray-500 mt-1">{blocks.length} stops</p>
        </div>

        {/* Install button */}
        {!isInstalled && isOnline && !progress && (
          <button
            onClick={handleInstall}
            className="text-sm px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors"
          >
            ↓ Install for offline
          </button>
        )}

        {isInstalled && (
          <span className="text-xs text-green-400 bg-green-900/40 px-3 py-1.5 rounded-full">✓ Available offline</span>
        )}
      </div>

      {/* Progress bar */}
      {progress && progress.status !== 'done' && (
        <div className="mb-6 border border-gray-800 rounded-lg p-4 bg-gray-900">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>{progress.status === 'retrying' ? '⟳ Retrying failed assets...' : '↓ Downloading...'}</span>
            <span>{progress.completed}/{progress.total}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }}
            />
          </div>
          {progress.failed.length > 0 && (
            <p className="text-xs text-amber-400 mt-2">⚠ {progress.failed.length} assets pending retry</p>
          )}
        </div>
      )}

      {/* Block player */}
      {currentBlock && (
        <div className="border border-gray-800 rounded-lg bg-gray-900 overflow-hidden">
          {/* Stop indicator */}
          <div className="border-b border-gray-800 px-5 py-3 flex items-center justify-between">
            <span className="text-xs font-mono text-gray-500">
              Stop {currentBlock.stop_number} of {blocks.length}
            </span>
            <div className="flex gap-1">
              {blocks.map((b, i) => (
                <div
                  key={b.id}
                  className={`w-2 h-2 rounded-full ${b.id === currentBlock.id ? 'bg-blue-400' : 'bg-gray-700'}`}
                />
              ))}
            </div>
          </div>

          {/* Media */}
          {currentBlock.media_type === 'video' && mediaSrc && (
            <video
              src={mediaSrc}
              controls
              className="w-full max-h-64 object-cover bg-black"
              playsInline
            />
          )}
          {currentBlock.media_type === 'image' && mediaSrc && (
            <img src={mediaSrc} alt="" className="w-full max-h-64 object-cover" />
          )}
          {currentBlock.media_url && !mediaSrc && !isInstalled && (
            <div className="w-full h-32 bg-gray-800 flex items-center justify-center text-xs text-gray-600">
              Install to view media offline
            </div>
          )}

          <div className="p-5">
            <h3 className="font-semibold text-gray-100 mb-3">{currentBlock.title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{currentBlock.text}</p>

            {/* Audio player */}
            {currentBlock.audio_url && currentBlock.media_type !== 'video' && (
              <div className="mt-4">
                {audioSrc ? (
                  <audio ref={audioRef} src={audioSrc} controls className="w-full h-10" />
                ) : (
                  <div className="text-xs text-gray-600 py-2">
                    {isInstalled ? 'Loading audio...' : 'Install to play audio offline'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="border-t border-gray-800 px-5 py-3 flex justify-between">
            <button
              onClick={goBack}
              disabled={!currentBlock.parent_id}
              className="text-sm px-4 py-1.5 rounded border border-gray-700 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <button
              onClick={goNext}
              disabled={!currentBlock.next_id}
              className="text-sm px-4 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {!isInstalled && !isOnline && (
        <div className="text-center py-8 text-gray-500 text-sm">
          <p>Go online to install this guide for offline use.</p>
        </div>
      )}
    </div>
  );
}
