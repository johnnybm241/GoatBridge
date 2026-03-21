import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import type { Response } from 'express';
import { getOpenTeamMatches, getTeamMatch, createTeamMatch } from './teamMatchManager.js';
import type { TeamMatch } from './teamMatchManager.js';

const router = Router();

function toClientMatch(m: TeamMatch) {
  const { preDealtBoards, ...rest } = m;
  return rest;
}

// GET /team-matches — list open matches
router.get('/', requireAuth, (_req: AuthRequest, res: Response) => {
  const matches = getOpenTeamMatches().map(toClientMatch);
  res.json({ matches });
});

// GET /team-matches/:code — get match state
router.get('/:code', requireAuth, (req: AuthRequest, res: Response) => {
  const match = getTeamMatch(req.params.code);
  if (!match) {
    res.status(404).json({ error: 'Team match not found' });
    return;
  }
  res.json({ match: toClientMatch(match) });
});

// POST /team-matches — create match
router.post('/', requireAuth, (req: AuthRequest, res: Response) => {
  const { name, boardCount } = req.body as { name?: string; boardCount?: number };
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!boardCount || ![4, 8, 12, 16].includes(boardCount)) {
    res.status(400).json({ error: 'boardCount must be 4, 8, 12, or 16' });
    return;
  }
  const userId = req.userId!;
  const match = createTeamMatch(userId, name.trim(), boardCount);
  res.status(201).json({ match: toClientMatch(match) });
});

export default router;
