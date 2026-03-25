import { Router } from 'express';
import { getLocalInterfaces } from '../services/networkInterfaces';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getLocalInterfaces());
});

export default router;
