const DB_NAME = 'offline-audio-guide';
const DB_VERSION = 1;
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

let db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Pack manifests
      if (!database.objectStoreNames.contains('packs')) {
        database.createObjectStore('packs', { keyPath: 'id' });
      }

      // Audio chunks: { key: `${blockId}_audio_${chunkIndex}`, data: Blob }
      if (!database.objectStoreNames.contains('audio_chunks')) {
        const store = database.createObjectStore('audio_chunks', { keyPath: 'key' });
        store.createIndex('block_id', 'block_id', { unique: false });
      }

      // Media chunks (image/video): { key: `${blockId}_media_${chunkIndex}`, data: Blob }
      if (!database.objectStoreNames.contains('media_chunks')) {
        const store = database.createObjectStore('media_chunks', { keyPath: 'key' });
        store.createIndex('block_id', 'block_id', { unique: false });
      }

      // Session events queue (synced to backend when online)
      if (!database.objectStoreNames.contains('session_queue')) {
        database.createObjectStore('session_queue', { keyPath: 'id', autoIncrement: true });
      }

      // Track which packs are installed
      if (!database.objectStoreNames.contains('install_state')) {
        database.createObjectStore('install_state', { keyPath: 'pack_id' });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

// --- Chunk storage ---

function splitBlob(blob: Blob): Blob[] {
  const chunks: Blob[] = [];
  let offset = 0;
  while (offset < blob.size) {
    chunks.push(blob.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }
  return chunks;
}

export async function storeBlob(
  store: 'audio_chunks' | 'media_chunks',
  blockId: string,
  blob: Blob
): Promise<void> {
  const database = await openDB();
  const chunks = splitBlob(blob);

  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    const s = tx.objectStore(store);

    chunks.forEach((chunk, index) => {
      s.put({ key: `${blockId}_${store}_${index}`, block_id: blockId, chunk_index: index, data: chunk });
    });

    // Store chunk count marker
    s.put({ key: `${blockId}_${store}_count`, block_id: blockId, chunk_index: -1, count: chunks.length });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function retrieveBlob(
  store: 'audio_chunks' | 'media_chunks',
  blockId: string
): Promise<Blob | null> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readonly');
    const s = tx.objectStore(store);

    const countReq = s.get(`${blockId}_${store}_count`);
    countReq.onsuccess = () => {
      const meta = countReq.result;
      if (!meta) return resolve(null);

      const { count } = meta;
      const chunks: Blob[] = new Array(count);
      let loaded = 0;

      for (let i = 0; i < count; i++) {
        const req = s.get(`${blockId}_${store}_${i}`);
        req.onsuccess = () => {
          if (req.result) chunks[req.result.chunk_index] = req.result.data;
          loaded++;
          if (loaded === count) {
            resolve(new Blob(chunks));
          }
        };
        req.onerror = () => reject(req.error);
      }
    };
    countReq.onerror = () => reject(countReq.error);
  });
}

export async function blobExists(
  store: 'audio_chunks' | 'media_chunks',
  blockId: string
): Promise<boolean> {
  const database = await openDB();
  return new Promise((resolve) => {
    const tx = database.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(`${blockId}_${store}_count`);
    req.onsuccess = () => resolve(!!req.result);
    req.onerror = () => resolve(false);
  });
}

// --- Pack manifest ---

export async function storePack(pack: object): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('packs', 'readwrite');
    tx.objectStore('packs').put(pack);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllInstalledPacks(): Promise<any[]> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['packs', 'install_state'], 'readonly');
    const stateReq = tx.objectStore('install_state').getAll();
    stateReq.onsuccess = () => {
      const installedIds: string[] = stateReq.result
        .filter((s: any) => s.installed)
        .map((s: any) => s.pack_id);

      if (installedIds.length === 0) return resolve([]);

      const packsStore = tx.objectStore('packs');
      const packs: any[] = [];
      let remaining = installedIds.length;

      installedIds.forEach(id => {
        const req = packsStore.get(id);
        req.onsuccess = () => {
          if (req.result) packs.push(req.result);
          remaining--;
          if (remaining === 0) resolve(packs);
        };
        req.onerror = () => { remaining--; if (remaining === 0) resolve(packs); };
      });
    };
    stateReq.onerror = () => reject(stateReq.error);
  });
}

export async function getPack(packId: string): Promise<any | null> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('packs', 'readonly');
    const req = tx.objectStore('packs').get(packId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// --- Install state ---

export async function setInstallState(packId: string, state: object): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('install_state', 'readwrite');
    tx.objectStore('install_state').put({ pack_id: packId, ...state });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getInstallState(packId: string): Promise<any | null> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('install_state', 'readonly');
    const req = tx.objectStore('install_state').get(packId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// --- Session queue ---

export async function enqueueSession(event: object): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('session_queue', 'readwrite');
    tx.objectStore('session_queue').add(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllQueuedSessions(): Promise<any[]> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('session_queue', 'readonly');
    const req = tx.objectStore('session_queue').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearSessionQueue(): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('session_queue', 'readwrite');
    tx.objectStore('session_queue').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
