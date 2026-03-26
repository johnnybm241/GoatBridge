import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import type { Response } from 'express';
import { getTournament, getOpenTournaments, toClientTournament } from './tournamentManager.js';
import { sqlite } from '../db/index.js';

const router = Router();

// GET /tournaments - list open tournaments
router.get('/', (req, res) => {
  const open = getOpenTournaments();
  res.json({ tournaments: open.map(toClientTournament) });
});

// GET /tournaments/users/search?q=username - search users (requires auth)
router.get('/users/search', requireAuth, (req: AuthRequest, res: Response) => {
  const q = req.query.q as string | undefined;
  if (!q || !q.trim()) {
    res.json({ users: [] });
    return;
  }
  const users = sqlite.all<{ id: string; username: string }>(
    'SELECT id, username FROM users WHERE username LIKE ? ORDER BY username LIMIT 20',
    [`%${q.trim()}%`],
  );
  res.json({ users });
});

// GET /tournaments/:code/boards - get completed board records for review
router.get('/:code/boards', (req, res) => {
  const t = getTournament(req.params.code);
  if (!t) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  res.json({ boards: t.completedBoards });
});

// GET /tournaments/:code - get single tournament
router.get('/:code', (req, res) => {
  const t = getTournament(req.params.code);
  if (!t) {
    res.status(404).json({ error: 'Tournament not found' });
    return;
  }
  res.json({ tournament: toClientTournament(t) });
});

export default router;
