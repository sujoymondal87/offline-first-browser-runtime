export interface Pack {
  id: string;
  title: string;
  description: string;
  cover_image_url: string | null;
  created_at: string;
  blocks?: Block[];
}

export interface Block {
  id: string;
  pack_id: string;
  parent_id: string | null;
  next_id: string | null;
  stop_number: number;
  title: string;
  text: string;
  audio_url: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  duration_seconds: number | null;
}

export type SessionEvent = 'installed' | 'started' | 'completed';

export interface SessionRecord {
  id?: string;
  pack_id: string;
  block_id: string;
  event: SessionEvent;
  device_id: string;
  created_at: string;
  synced_at?: string;
  packs?: { title: string };
  blocks?: { title: string };
}

export type InstallStatus = 'idle' | 'downloading' | 'retrying' | 'done' | 'error';

export interface DownloadProgress {
  total: number;
  completed: number;
  failed: string[];
  status: InstallStatus;
}
