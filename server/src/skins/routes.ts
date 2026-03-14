import { Router } from 'express';
import { sqlite } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import { spendGoats } from '../goats/goatService.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', requireAuth, (req: AuthRequest, res) => {
  const allSkins = sqlite.all<{ id: string; name: string; slug: string; description: string; preview_url: string; unlock_type: string; unlock_threshold: number | null; goat_cost: number | null }>('SELECT * FROM skins');
  const owned = sqlite.all<{ skin_id: string }>('SELECT skin_id FROM user_skins WHERE user_id = ?', [req.userId!]);
  const ownedIds = new Set(owned.map(s => s.skin_id));

  const handsPlayed = sqlite.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM room_players rp JOIN rooms r ON rp.room_id = r.id WHERE rp.user_id = ? AND rp.is_ai = 0',
    [req.userId!],
  )?.count ?? 0;

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
  const skin = sqlite.get<{ id: string; slug: string; unlock_type: string; goat_cost: number | null }>('SELECT * FROM skins WHERE slug = ?', [req.params.slug]);
  if (!skin) { res.status(404).json({ error: 'Skin not found' }); return; }
  if (skin.unlock_type !== 'purchase' || skin.goat_cost == null) {
    res.status(400).json({ error: 'Skin is not purchasable' });
    return;
  }

  const alreadyOwned = sqlite.get('SELECT id FROM user_skins WHERE user_id = ? AND skin_id = ?', [req.userId!, skin.id]);
  if (alreadyOwned) { res.status(400).json({ error: 'Already owned' }); return; }

  try {
    spendGoats(req.userId!, skin.goat_cost, 'skin_purchase', skin.id);
    sqlite.run('INSERT INTO user_skins (id, user_id, skin_id, unlocked_at) VALUES (?, ?, ?, ?)', [uuidv4(), req.userId!, skin.id, Date.now()]);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
