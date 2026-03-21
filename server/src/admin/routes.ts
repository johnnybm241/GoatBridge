import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import type { Response } from 'express';
import { sqlite } from '../db/index.js';

const router = Router();

// GET /admin/users?q=search - list/search users
router.get('/users', requireAuth, requireAdmin, (req: AuthRequest, res: Response) => {
  const q = req.query.q as string | undefined;
  let users: unknown[];
  if (q && q.trim()) {
    users = sqlite.all(
      'SELECT id, username, email, goat_balance, bleats, hands_played, is_admin, can_create_tournament, created_at FROM users WHERE username LIKE ? ORDER BY username LIMIT 50',
      [`%${q.trim()}%`],
    );
  } else {
    users = sqlite.all(
      'SELECT id, username, email, goat_balance, bleats, hands_played, is_admin, can_create_tournament, created_at FROM users ORDER BY username LIMIT 100',
    );
  }
  res.json({ users });
});

// PATCH /admin/users/:id/roles
router.patch('/users/:id/roles', requireAuth, requireAdmin, (req: AuthRequest, res: Response) => {
  const { isAdmin, canCreateTournament } = req.body as { isAdmin?: boolean; canCreateTournament?: boolean };
  const targetId = req.params.id;

  // Protect Johnnybm: cannot remove admin
  if (isAdmin === false) {
    const target = sqlite.get<{ username: string }>('SELECT username FROM users WHERE id = ?', [targetId]);
    if (target?.username === 'Johnnybm') {
      res.status(403).json({ error: 'Cannot remove admin from Johnnybm' });
      return;
    }
  }

  if (isAdmin !== undefined) {
    sqlite.run('UPDATE users SET is_admin = ? WHERE id = ?', [isAdmin ? 1 : 0, targetId]);
  }
  if (canCreateTournament !== undefined) {
    sqlite.run('UPDATE users SET can_create_tournament = ? WHERE id = ?', [canCreateTournament ? 1 : 0, targetId]);
  }
  const updated = sqlite.get<{ id: string; username: string; is_admin: number; can_create_tournament: number }>(
    'SELECT id, username, is_admin, can_create_tournament FROM users WHERE id = ?', [targetId],
  );
  if (!updated) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ user: { ...updated, isAdmin: !!updated.is_admin, canCreateTournament: !!updated.can_create_tournament } });
});

export default router;
