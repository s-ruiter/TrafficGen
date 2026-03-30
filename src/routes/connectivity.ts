import { Router } from 'express';
import { checkConnectivity } from '../services/connectivityChecker';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const result = await checkConnectivity();
    res.json(result);
  } catch {
    res.status(503).json({ ok: false, results: [] });
  }
});

export default router;
