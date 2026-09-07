import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import { sqlite } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import { findUserRoomPresence } from '../rooms/roomManager.js';
import { emitToUser } from '../socket/broadcaster.js';

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
  created_at: number;
}

function presenceFor(userId: string) {
  return findUserRoomPresence(userId);
}

// List accepted friends, with live table presence
router.get('/', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const rows = sqlite.all<FriendRequestRow & { username: string; bleats: number }>(
    `SELECT fr.*, u.username, u.bleats FROM friend_requests fr
     JOIN users u ON u.id = (CASE WHEN fr.requester_id = ? THEN fr.addressee_id ELSE fr.requester_id END)
     WHERE fr.status = 'accepted' AND (fr.requester_id = ? OR fr.addressee_id = ?)`,
    [userId, userId, userId],
  );

  const friends = rows.map(r => {
    const friendId = r.requester_id === userId ? r.addressee_id : r.requester_id;
    return {
      userId: friendId,
      username: r.username,
      bleats: r.bleats,
      presence: presenceFor(friendId),
    };
  });

  res.json({ friends });
});

// List pending requests (incoming + outgoing)
router.get('/requests', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const incoming = sqlite.all<FriendRequestRow & { username: string }>(
    `SELECT fr.*, u.username FROM friend_requests fr
     JOIN users u ON u.id = fr.requester_id
     WHERE fr.addressee_id = ? AND fr.status = 'pending'`,
    [userId],
  );
  const outgoing = sqlite.all<FriendRequestRow & { username: string }>(
    `SELECT fr.*, u.username FROM friend_requests fr
     JOIN users u ON u.id = fr.addressee_id
     WHERE fr.requester_id = ? AND fr.status = 'pending'`,
    [userId],
  );

  res.json({
    incoming: incoming.map(r => ({ id: r.id, userId: r.requester_id, username: r.username, createdAt: r.created_at })),
    outgoing: outgoing.map(r => ({ id: r.id, userId: r.addressee_id, username: r.username, createdAt: r.created_at })),
  });
});

// Search users by username substring (for adding friends)
router.get('/search', requireAuth, (req: AuthRequest, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) { res.json({ users: [] }); return; }
  const userId = req.userId!;
  const results = sqlite.all<UserRow>(
    'SELECT id, username, bleats, hands_played FROM users WHERE username LIKE ? AND id != ? ORDER BY username LIMIT 20',
    [`%${q}%`, userId],
  );
  res.json({ users: results.map(u => ({ userId: u.id, username: u.username, bleats: u.bleats })) });
});

// Send a friend request
router.post('/request', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { username } = req.body as { username?: string };
  if (!username) { res.status(400).json({ error: 'username required' }); return; }

  const target = sqlite.get<UserRow>('SELECT id, username, bleats, hands_played FROM users WHERE username = ?', [username]);
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.id === userId) { res.status(400).json({ error: 'Cannot friend yourself' }); return; }

  const existing = sqlite.get<FriendRequestRow>(
    `SELECT * FROM friend_requests
     WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
       AND status IN ('pending', 'accepted')`,
    [userId, target.id, target.id, userId],
  );
  if (existing) {
    res.status(409).json({ error: existing.status === 'accepted' ? 'Already friends' : 'Request already pending' });
    return;
  }

  const id = uuidv4();
  sqlite.run(
    'INSERT INTO friend_requests (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, userId, target.id, 'pending', Date.now()],
  );

  const requester = sqlite.get<UserRow>('SELECT username FROM users WHERE id = ?', [userId]);
  const io = req.app.get('io') as Server | undefined;
  if (io) {
    emitToUser(io, target.id, 'friend_request_received', { id, userId, username: requester?.username ?? '' });
  }

  res.status(201).json({ id });
});

// Accept a request (only the addressee can accept)
router.post('/:id/accept', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const fr = sqlite.get<FriendRequestRow>('SELECT * FROM friend_requests WHERE id = ?', [req.params.id]);
  if (!fr || fr.addressee_id !== userId || fr.status !== 'pending') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  sqlite.run('UPDATE friend_requests SET status = ?, responded_at = ? WHERE id = ?', ['accepted', Date.now(), fr.id]);

  const addressee = sqlite.get<UserRow>('SELECT username FROM users WHERE id = ?', [userId]);
  const io = req.app.get('io') as Server | undefined;
  if (io) {
    emitToUser(io, fr.requester_id, 'friend_request_accepted', { userId, username: addressee?.username ?? '' });
  }

  res.json({ success: true });
});

// Decline a request (only the addressee can decline)
router.post('/:id/decline', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const fr = sqlite.get<FriendRequestRow>('SELECT * FROM friend_requests WHERE id = ?', [req.params.id]);
  if (!fr || fr.addressee_id !== userId || fr.status !== 'pending') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  sqlite.run('DELETE FROM friend_requests WHERE id = ?', [fr.id]);
  res.json({ success: true });
});

// Cancel an outgoing pending request
router.delete('/requests/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const fr = sqlite.get<FriendRequestRow>('SELECT * FROM friend_requests WHERE id = ?', [req.params.id]);
  if (!fr || fr.requester_id !== userId || fr.status !== 'pending') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  sqlite.run('DELETE FROM friend_requests WHERE id = ?', [fr.id]);
  res.json({ success: true });
});

// Remove an existing friendship
router.delete('/:friendUserId', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const friendUserId = req.params.friendUserId;
  const fr = sqlite.get<FriendRequestRow>(
    `SELECT * FROM friend_requests
     WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
    [userId, friendUserId, friendUserId, userId],
  );
  if (!fr) { res.status(404).json({ error: 'Not friends' }); return; }
  sqlite.run('DELETE FROM friend_requests WHERE id = ?', [fr.id]);
  res.json({ success: true });
});

export default router;
