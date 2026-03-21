import { Router } from 'express';
import { sqlite } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', requireAuth, (req: AuthRequest, res) => {
  const allSkins = sqlite.all<{ id: string; name: string; slug: string; description: string; preview_url: string; unlock_type: string; unlock_threshold: number | null; goat_cost: number | null }>('SELECT id, name, slug, description, preview_url, unlock_type, unlock_threshold, goat_cost FROM skins');
  const owned = sqlite.all<{ skin_id: string }>('SELECT skin_id FROM user_skins WHERE user_id = ?', [req.userId!]);
  const ownedIds = new Set(owned.map(s => s.skin_id));

  const userRow = sqlite.get<{ hands_played: number }>('SELECT hands_played FROM users WHERE id = ?', [req.userId!]);
  const handsPlayed = userRow?.hands_played ?? 0;

  const result = allSkins.map(skin => ({
    id: skin.id,
    name: skin.name,
    slug: skin.slug,
    description: skin.description,
    previewUrl: skin.preview_url,
    unlockType: skin.unlock_type,
    unlockThreshold: skin.unlock_threshold,
    goatCost: skin.goat_cost,
    owned: skin.unlock_type === 'default' || ownedIds.has(skin.id),
    unlocked: skin.unlock_type === 'default' ||
      ownedIds.has(skin.id) ||
      (skin.unlock_type === 'progress' && skin.unlock_threshold != null && handsPlayed >= skin.unlock_threshold),
  }));

  res.json({ skins: result });
});

router.post('/:slug/equip', requireAuth, (req: AuthRequest, res) => {
  const skin = sqlite.get<{ id: string; slug: string }>('SELECT id, slug FROM skins WHERE slug = ?', [req.params.slug]);
  if (!skin) { res.status(404).json({ error: 'Skin not found' }); return; }
  sqlite.run('UPDATE users SET active_card_back_skin = ? WHERE id = ?', [skin.slug, req.userId!]);
  res.json({ success: true });
});

router.post('/:slug/buy', requireAuth, (req: AuthRequest, res) => {
  const skin = sqlite.get<{ id: string; slug: string; unlock_type: string; goat_cost: number | null }>('SELECT id, slug, unlock_type, goat_cost FROM skins WHERE slug = ?', [req.params.slug]);
  if (!skin) { res.status(404).json({ error: 'Skin not found' }); return; }
  if (skin.unlock_type !== 'purchase' || skin.goat_cost == null) {
    res.status(400).json({ error: 'Skin is not purchasable' });
    return;
  }

  const alreadyOwned = sqlite.get('SELECT id FROM user_skins WHERE user_id = ? AND skin_id = ?', [req.userId!, skin.id]);
  if (alreadyOwned) { res.status(400).json({ error: 'Already owned' }); return; }

  const user = sqlite.get<{ goat_balance: number }>('SELECT goat_balance FROM users WHERE id = ?', [req.userId!]);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  if (user.goat_balance < skin.goat_cost) {
    res.status(400).json({ error: 'Not enough goats' });
    return;
  }
  sqlite.run('UPDATE users SET goat_balance = goat_balance - ? WHERE id = ?', [skin.goat_cost, req.userId!]);

  sqlite.run('INSERT INTO user_skins (id, user_id, skin_id, unlocked_at) VALUES (?, ?, ?, ?)', [uuidv4(), req.userId!, skin.id, Date.now()]);
  const updated = sqlite.get<{ goat_balance: number }>('SELECT goat_balance FROM users WHERE id = ?', [req.userId!]);
  res.json({ success: true, goatBalance: updated?.goat_balance ?? 0 });
});

export default router;
