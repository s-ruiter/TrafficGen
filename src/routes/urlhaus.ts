import { Router } from 'express';
import { readUrlhausCache, refreshUrlhausCache } from '../services/urlhausFetcher';

const router = Router();

router.get('/status', async (_req, res) => {
  const cache = await readUrlhausCache();
  if (!cache) return res.json({ timestamp: null, count: 0 }) as any;
  res.json({ timestamp: cache.timestamp, count: cache.urls.length });
});

router.post('/refresh', async (_req, res) => {
  try {
    const cache = await refreshUrlhausCache();
    res.json({ timestamp: cache.timestamp, count: cache.urls.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
