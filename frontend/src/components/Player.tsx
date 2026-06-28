import { useState, useEffect, useRef } from 'react';
import { Pack, Block, DownloadProgress } from '../types';
import { retrieveBlob, getInstallState, getPack } from '../lib/idb';
import { installPack } from '../lib/installer';
import { trackEvent } from '../lib/session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

interface Props {
  pack: Pack;
  onBack: () => void;
  isOnline: boolean;
  initialBlockId?: string | null;
  onPositionChange?: (packId: string, blockId: string) => void;
}

export default function Player({ pack, onBack: _onBack, isOnline, initialBlockId, onPositionChange }: Props) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [currentBlock, setCurrentBlock] = useState<Block | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(!isIOS);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load pack — from IDB if installed, from API if online
  useEffect(() => {
    async function load() {
      const state = await getInstallState(pack.id);
      if (state?.installed) {
        const cached = await getPack(pack.id);
        if (cached?.blocks) {
          setBlocks(cached.blocks);
          const start = initialBlockId ? cached.blocks.find((b: Block) => b.id === initialBlockId) : null;
          setCurrentBlock(start ?? cached.blocks[0]);
          setIsInstalled(true);
          setLoading(false);
          return;
        }
      }

      if (isOnline) {
        try {
          const res = await fetch(`${API_URL}/api/packs/${pack.id}`);
          const data = await res.json();
          const blocks = data.blocks || [];
          setBlocks(blocks);
          const start = initialBlockId ? blocks.find((b: Block) => b.id === initialBlockId) : null;
          setCurrentBlock(start ?? blocks[0] ?? null);
        } catch {}
      }
      setLoading(false);
    }
    load();
  }, [pack.id, isOnline]);

  // Load audio/media when block changes
  useEffect(() => {
    if (!currentBlock) return;

    if (audioSrc?.startsWith('blob:')) URL.revokeObjectURL(audioSrc);
    if (mediaSrc?.startsWith('blob:')) URL.revokeObjectURL(mediaSrc);

    setAudioSrc(null);
    setMediaSrc(null);

    if (isInstalled) {
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
    } else {
      if (currentBlock.audio_url) setAudioSrc(currentBlock.audio_url);
      if (currentBlock.media_url) setMediaSrc(currentBlock.media_url);
    }

    trackEvent(pack.id, currentBlock.id, 'started');
    onPositionChange?.(pack.id, currentBlock.id);
  }, [currentBlock?.id, isInstalled]);

  // Autoplay audio when src is ready
  useEffect(() => {
    if (!audioSrc || !audioRef.current) return;
    audioRef.current.load();
    audioRef.current.play().catch(() => {});
  }, [audioSrc]);

  // Autoplay video when src is ready
  useEffect(() => {
    if (!mediaSrc || !videoRef.current) return;
    videoRef.current.load();
    videoRef.current.play().catch(() => {});
  }, [mediaSrc]);

  function stopAll() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }

  function handleAutoNext() {
    if (!currentBlock) return;
    if (!currentBlock.next_id) return;
    const next = blocks.find(b => b.id === currentBlock.next_id);
    if (next) {
      trackEvent(pack.id, currentBlock.id, 'completed');
      stopAll();
      setCurrentBlock(next);
    }
  }

  function goNext() {
    if (!currentBlock?.next_id) return;
    const next = blocks.find(b => b.id === currentBlock.next_id);
    if (next) {
      trackEvent(pack.id, currentBlock.id, 'completed');
      stopAll();
      setCurrentBlock(next);
    }
  }

  function goBack() {
    if (!currentBlock?.parent_id) return;
    const parent = blocks.find(b => b.id === currentBlock.parent_id);
    if (parent) {
      stopAll();
      setCurrentBlock(parent);
    }
  }

  function handleIOSTap() {
    if (audioUnlocked) return;
    const silent = new Audio();
    silent.play().catch(() => {});
    setAudioUnlocked(true);
    // Resume current audio if waiting
    audioRef.current?.play().catch(() => {});
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>;
  }

  return (
    <div onClick={isIOS && !audioUnlocked ? handleIOSTap : undefined}>
      {/* Top toolbar */}
      <div className="flex items-center justify-between mb-6">
        {/* Left: hamburger → go to first block */}
        <button
          onClick={() => { stopAll(); setCurrentBlock(blocks[0] ?? null); }}
          className="text-gray-400 hover:text-gray-100 w-9 h-9 flex items-center justify-center rounded hover:bg-gray-800 transition-colors"
          title="Go to first stop"
        >
          <i className="fa-solid fa-bars" />
        </button>

        {/* Centre: title + install badge */}
        <div className="flex-1 mx-4 min-w-0">
          <h2 className="text-base font-semibold truncate">{pack.title}</h2>
          <p className="text-xs text-gray-500">
            {currentBlock ? `Stop ${currentBlock.stop_number} of ${blocks.length}` : `${blocks.length} stops`}
          </p>
        </div>

        {/* Right: install + prev/next */}
        <div className="flex items-center gap-2 shrink-0">
          {!isInstalled && isOnline && !progress && (
            <button
              onClick={handleInstall}
              className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded transition-colors"
            >
              ↓ Install
            </button>
          )}
          {isInstalled && (
            <span className="text-xs text-green-400 bg-green-900/40 px-2 py-1 rounded-full">✓ offline</span>
          )}
          <button
            onClick={goBack}
            disabled={!currentBlock?.parent_id}
            className="w-9 h-9 flex items-center justify-center rounded border border-gray-700 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous"
          >
            <i className="fa-solid fa-backward-step" />
          </button>
          <button
            onClick={goNext}
            disabled={!currentBlock?.next_id}
            className="w-9 h-9 flex items-center justify-center rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next"
          >
            <i className="fa-solid fa-forward-step" />
          </button>
        </div>
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

          {/* Media — 16:9 */}
          {currentBlock.media_type === 'video' && (
            <div className="w-full aspect-video bg-black flex items-center justify-center">
              {mediaSrc
                ? <video ref={videoRef} src={mediaSrc} className="w-full h-full object-contain" playsInline autoPlay onEnded={handleAutoNext} />
                : <span className="text-xs text-gray-600">Media not available</span>
              }
            </div>
          )}
          {currentBlock.media_type === 'image' && (
            <div className="w-full aspect-video bg-black flex items-center justify-center">
              {mediaSrc
                ? <img src={mediaSrc} alt="" className="w-full h-full object-contain" />
                : <span className="text-xs text-gray-600">Image not available</span>
              }
            </div>
          )}

          {/* Hidden audio */}
          {audioSrc && currentBlock.media_type !== 'video' && (
            <audio
              ref={audioRef}
              src={audioSrc}
              onEnded={handleAutoNext}
            />
          )}

          <div className="p-5">
            <h3 className="font-semibold text-gray-100 mb-3">{currentBlock.title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{currentBlock.text}</p>
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
}
