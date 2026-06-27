import { Router } from 'express';
import { supabase } from '../supabase';

const router = Router();

// POST /api/sessions/sync — bulk sync session events from offline queue
router.post('/sync', async (req, res) => {
  const { events } = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events array required' });
  }

  const rows = events.map((e: any) => ({
    pack_id: e.pack_id,
    block_id: e.block_id,
    event: e.event,
    device_id: e.device_id,
    created_at: e.created_at,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('sessions').insert(rows);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ synced: rows.length });
});

// GET /api/sessions/recent — last 20 events for dashboard
router.get('/recent', async (_req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, packs(title)')
    .order('synced_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

export default router;
