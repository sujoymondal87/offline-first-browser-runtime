import { Router } from 'express';
import { supabase } from '../supabase';

const router = Router();

// GET /api/packs — all packs
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('packs')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// GET /api/packs/:packId — single pack with all blocks
router.get('/:packId', async (req, res) => {
  const { packId } = req.params;

  const { data: pack, error: packError } = await supabase
    .from('packs')
    .select('*')
    .eq('id', packId)
    .single();

  if (packError) return res.status(404).json({ error: 'Pack not found' });

  return res.json(pack);
});

export default router;
