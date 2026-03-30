import { Router } from 'express';
import { checkConnectivity } from '../services/connectivityChecker';

const router = Router();

router.get('/', async (_req, res) => {
  const result = await checkConnectivity();
  res.json(result);
});

export default router;
