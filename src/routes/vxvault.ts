import { Router } from 'express';
import { readCache, refreshCache } from '../services/vxvaultFetcher';

const router = Router();

router.get('/status', async (_req, res) => {
  const cache = await readCache();
  if (!cache) return res.json({ timestamp: null, count: 0 }) as any;
  res.json({ timestamp: cache.timestamp, count: cache.urls.length });
});

router.post('/refresh', async (_req, res) => {
  try {
    const cache = await refreshCache();
    res.json({ timestamp: cache.timestamp, count: cache.urls.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
