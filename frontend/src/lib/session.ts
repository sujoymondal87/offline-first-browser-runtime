import { enqueueSession, getAllQueuedSessions, clearSessionQueue } from './idb';
import { getDeviceId } from './deviceId';
import { SessionEvent } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function trackEvent(packId: string, blockId: string, event: SessionEvent) {
  const record = {
    pack_id: packId,
    block_id: blockId,
    event,
    device_id: getDeviceId(),
    created_at: new Date().toISOString(),
  };

  await enqueueSession(record);

  // Try immediate sync if online
  if (navigator.onLine) {
    await flushSessionQueue();
  }
}

export async function flushSessionQueue(): Promise<number> {
  const events = await getAllQueuedSessions();
  if (events.length === 0) return 0;

  try {
    const res = await fetch(`${API_URL}/api/sessions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });

    if (res.ok) {
      await clearSessionQueue();
      return events.length;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function fetchRecentSessions() {
  try {
    const res = await fetch(`${API_URL}/api/sessions/recent`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
