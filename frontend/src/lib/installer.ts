import { Block, DownloadProgress } from '../types';
import { storeBlob, blobExists, storePack, setInstallState } from './idb';

const RETRY_KEY_PREFIX = 'offline_guide_failed_';
const MAX_RETRIES = 3;

function getFailedKey(packId: string) {
  return `${RETRY_KEY_PREFIX}${packId}`;
}

export function getFailedAssets(packId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(getFailedKey(packId)) || '[]');
  } catch {
    return [];
  }
}

function setFailedAssets(packId: string, urls: string[]) {
  localStorage.setItem(getFailedKey(packId), JSON.stringify(urls));
}

export function clearFailedAssets(packId: string) {
  localStorage.removeItem(getFailedKey(packId));
}

async function downloadBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.blob();
}

async function downloadAssetWithRetry(
  url: string,
  store: 'audio_chunks' | 'media_chunks',
  blockId: string,
  retries = MAX_RETRIES
): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const blob = await downloadBlob(url);
      await storeBlob(store, blockId, blob);
      return true;
    } catch {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  return false;
}

export async function installPack(
  pack: any,
  blocks: Block[],
  onProgress: (progress: DownloadProgress) => void
): Promise<boolean> {
  const assets: Array<{ url: string; store: 'audio_chunks' | 'media_chunks'; blockId: string }> = [];

  for (const block of blocks) {
    if (block.audio_url) {
      assets.push({ url: block.audio_url, store: 'audio_chunks', blockId: block.id });
    }
    if (block.media_url) {
      assets.push({ url: block.media_url, store: 'media_chunks', blockId: block.id });
    }
  }

  const failed: string[] = [];
  let completed = 0;
  const total = assets.length;

  onProgress({ total, completed: 0, failed: [], status: 'downloading' });

  // Store pack manifest in IDB
  await storePack({ ...pack, blocks });

  // Download all assets
  for (const asset of assets) {
    const alreadyStored = await blobExists(asset.store, asset.blockId);
    if (alreadyStored) {
      completed++;
      onProgress({ total, completed, failed: [...failed], status: 'downloading' });
      continue;
    }

    const success = await downloadAssetWithRetry(asset.url, asset.store, asset.blockId);
    if (!success) {
      failed.push(asset.url);
    }
    completed++;
    onProgress({ total, completed, failed: [...failed], status: 'downloading' });
  }

  if (failed.length > 0) {
    setFailedAssets(pack.id, failed);
    onProgress({ total, completed, failed, status: 'retrying' });

    // One final retry pass for failed assets
    const stillFailed: string[] = [];
    for (const url of failed) {
      const asset = assets.find(a => a.url === url);
      if (!asset) continue;
      const success = await downloadAssetWithRetry(url, asset.store, asset.blockId, 2);
      if (!success) stillFailed.push(url);
    }

    if (stillFailed.length > 0) {
      setFailedAssets(pack.id, stillFailed);
      // Mark installed anyway — missing assets show placeholder, rest works offline
      await setInstallState(pack.id, { installed: true, installed_at: new Date().toISOString() });
      onProgress({ total, completed, failed: stillFailed, status: 'done' });
      return true;
    }
  }

  clearFailedAssets(pack.id);
  await setInstallState(pack.id, { installed: true, installed_at: new Date().toISOString() });
  onProgress({ total, completed: total, failed: [], status: 'done' });
  return true;
}
