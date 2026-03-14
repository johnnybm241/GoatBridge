import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import { getBalance, getTransactionHistory } from './goatService.js';

const router = Router();

router.get('/balance', requireAuth, (req: AuthRequest, res) => {
  const balance = getBalance(req.userId!);
  res.json({ balance });
});

router.get('/transactions', requireAuth, (req: AuthRequest, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);
  const offset = parseInt((req.query.offset as string) ?? '0', 10);
  const transactions = getTransactionHistory(req.userId!, limit, offset);
  res.json({ transactions });
});

export default router;
