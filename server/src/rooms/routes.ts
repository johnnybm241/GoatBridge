import { Router } from 'express';
import { sqlite } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';

const router = Router();

router.get('/:code/history', requireAuth, (_req: AuthRequest, res) => {
  const room = sqlite.get<{ id: string }>('SELECT id FROM rooms WHERE room_code = ?', [_req.params.code]);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
  const hands = sqlite.all('SELECT * FROM game_hands WHERE room_id = ?', [room.id]);
  res.json({ hands });
});

export default router;
