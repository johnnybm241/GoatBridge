import { Router } from 'express';
import { sqlite } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import { rooms } from './roomManager.js';
import { SEATS } from '@goatbridge/shared';

const router = Router();

// Returns in-memory rooms where the authenticated user has a seat
router.get('/active', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const active: { roomCode: string; seat: string; phase: string; handNumber: number }[] = [];

  for (const [code, room] of rooms) {
    for (const seat of SEATS) {
      if (room.seats[seat].userId === userId) {
        active.push({
          roomCode: code,
          seat,
          phase: room.game?.phase ?? 'waiting',
          handNumber: room.game?.handNumber ?? 0,
        });
        break;
      }
    }
  }

  res.json({ rooms: active });
});

router.get('/:code/history', requireAuth, (_req: AuthRequest, res) => {
  const room = sqlite.get<{ id: string }>('SELECT id FROM rooms WHERE room_code = ?', [_req.params.code]);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
  const hands = sqlite.all('SELECT * FROM game_hands WHERE room_id = ?', [room.id]);
  res.json({ hands });
});

export default router;
