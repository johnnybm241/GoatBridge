import { Router } from 'express';
import { sqlite } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_CONVENTION_CARD } from '@goatbridge/shared';

const router = Router();

router.get('/', requireAuth, (req: AuthRequest, res) => {
  const cards = sqlite.all<{ id: string; name: string; is_default: number; sections_json: string; created_at: number; updated_at: number }>(
    'SELECT * FROM convention_cards WHERE owner_id = ?',
    [req.userId!],
  );
  res.json({ conventionCards: cards.map(c => ({ ...c, isDefault: !!c.is_default, sections: JSON.parse(c.sections_json) })) });
});

router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { name, sections } = req.body as { name?: string; sections?: unknown };
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const now = Date.now();
  const id = uuidv4();
  sqlite.run(
    'INSERT INTO convention_cards (id, owner_id, name, is_default, sections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.userId!, name, 0, JSON.stringify(sections ?? DEFAULT_CONVENTION_CARD), now, now],
  );
  res.status(201).json({ id });
});

router.get('/:id', (req, res) => {
  const card = sqlite.get<{ id: string; name: string; sections_json: string }>('SELECT * FROM convention_cards WHERE id = ?', [req.params.id]);
  if (!card) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ...card, sections: JSON.parse(card.sections_json) });
});

router.put('/:id', requireAuth, (req: AuthRequest, res) => {
  const card = sqlite.get<{ id: string; owner_id: string; name: string; sections_json: string }>('SELECT * FROM convention_cards WHERE id = ?', [req.params.id]);
  if (!card || card.owner_id !== req.userId) { res.status(403).json({ error: 'Forbidden' }); return; }
  const { name, sections } = req.body as { name?: string; sections?: unknown };
  sqlite.run(
    'UPDATE convention_cards SET name = ?, sections_json = ?, updated_at = ? WHERE id = ?',
    [name ?? card.name, sections ? JSON.stringify(sections) : card.sections_json, Date.now(), req.params.id],
  );
  res.json({ success: true });
});

router.delete('/:id', requireAuth, (req: AuthRequest, res) => {
  const card = sqlite.get<{ owner_id: string }>('SELECT owner_id FROM convention_cards WHERE id = ?', [req.params.id]);
  if (!card || card.owner_id !== req.userId) { res.status(403).json({ error: 'Forbidden' }); return; }
  sqlite.run('DELETE FROM convention_cards WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

router.post('/:id/default', requireAuth, (req: AuthRequest, res) => {
  const card = sqlite.get<{ owner_id: string }>('SELECT owner_id FROM convention_cards WHERE id = ?', [req.params.id]);
  if (!card || card.owner_id !== req.userId) { res.status(403).json({ error: 'Forbidden' }); return; }
  sqlite.run('UPDATE convention_cards SET is_default = 0 WHERE owner_id = ?', [req.userId!]);
  sqlite.run('UPDATE convention_cards SET is_default = 1 WHERE id = ?', [req.params.id]);
  sqlite.run('UPDATE users SET default_convention_card_id = ? WHERE id = ?', [req.params.id, req.userId!]);
  res.json({ success: true });
});

export default router;
