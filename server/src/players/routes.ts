import { Router } from 'express';
import { sqlite } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import { findUserRoomPresence } from '../rooms/roomManager.js';
import type { FriendshipStatus } from '@goatbridge/shared';

const router = Router();

interface UserRow {
  id: string;
  username: string;
  bleats: number;
  hands_played: number;
}

interface FriendRequestRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
}

// Public player profile: rank/stats + live table presence + friendship status
router.get('/:username', requireAuth, (req: AuthRequest, res) => {
  const viewerId = req.userId!;
  const target = sqlite.get<UserRow>(
    'SELECT id, username, bleats, hands_played FROM users WHERE username = ?',
    [req.params.username],
  );
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }

  let friendshipStatus: FriendshipStatus = 'none';
  let friendRequestId: string | null = null;

  if (target.id === viewerId) {
    friendshipStatus = 'self';
  } else {
    const fr = sqlite.get<FriendRequestRow>(
      `SELECT * FROM friend_requests
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      [viewerId, target.id, target.id, viewerId],
    );
    if (fr) {
      if (fr.status === 'accepted') {
        friendshipStatus = 'friends';
      } else if (fr.status === 'pending') {
        friendshipStatus = fr.requester_id === viewerId ? 'pending_sent' : 'pending_received';
        friendRequestId = fr.id;
      }
    }
  }

  res.json({
    userId: target.id,
    username: target.username,
    bleats: target.bleats,
    handsPlayed: target.hands_played,
    friendshipStatus,
    friendRequestId,
    presence: findUserRoomPresence(target.id),
  });
});

export default router;
