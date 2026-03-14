import { Router } from 'express';
import { sqlite } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', requireAuth, (req: AuthRequest, res) => {
  const ps = sqlite.all('SELECT * FROM partnerships WHERE user_a_id = ? OR user_b_id = ?', [req.userId!, req.userId!]);
  res.json({ partnerships: ps });
});

router.post('/request', requireAuth, (req: AuthRequest, res) => {
  const { toUsername } = req.body as { toUsername?: string };
  if (!toUsername) { res.status(400).json({ error: 'toUsername required' }); return; }

  const partner = sqlite.get<{ id: string }>('SELECT id FROM users WHERE username = ?', [toUsername]);
  if (!partner) { res.status(404).json({ error: 'User not found' }); return; }
  if (partner.id === req.userId) { res.status(400).json({ error: 'Cannot partner with yourself' }); return; }

  const existing = sqlite.get(
    'SELECT id FROM partnerships WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)',
    [req.userId!, partner.id, partner.id, req.userId!],
  );
  if (existing) { res.status(409).json({ error: 'Partnership already exists' }); return; }

  const id = uuidv4();
  sqlite.run(
    'INSERT INTO partnerships (id, user_a_id, user_b_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, req.userId!, partner.id, 'pending', Date.now()],
  );
  res.status(201).json({ id });
});

router.post('/:id/accept', requireAuth, (req: AuthRequest, res) => {
  const p = sqlite.get<{ user_b_id: string }>('SELECT user_b_id FROM partnerships WHERE id = ?', [req.params.id]);
  if (!p || p.user_b_id !== req.userId) { res.status(403).json({ error: 'Forbidden' }); return; }
  sqlite.run('UPDATE partnerships SET status = ? WHERE id = ?', ['accepted', req.params.id]);
  res.json({ success: true });
});

router.delete('/:id', requireAuth, (req: AuthRequest, res) => {
  const p = sqlite.get<{ user_a_id: string; user_b_id: string }>('SELECT user_a_id, user_b_id FROM partnerships WHERE id = ?', [req.params.id]);
  if (!p || (p.user_a_id !== req.userId && p.user_b_id !== req.userId)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  sqlite.run('DELETE FROM partnerships WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

router.put('/:id/card', requireAuth, (req: AuthRequest, res) => {
  const { conventionCardId } = req.body as { conventionCardId?: string };
  const p = sqlite.get<{ user_a_id: string; user_b_id: string }>('SELECT user_a_id, user_b_id FROM partnerships WHERE id = ?', [req.params.id]);
  if (!p || (p.user_a_id !== req.userId && p.user_b_id !== req.userId)) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  sqlite.run('UPDATE partnerships SET convention_card_id = ? WHERE id = ?', [conventionCardId ?? null, req.params.id]);
  res.json({ success: true });
});

export default router;
