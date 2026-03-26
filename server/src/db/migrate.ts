import { sqlite } from './index.js';
import { v4 as uuidv4 } from 'uuid';

export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      active_card_back_skin TEXT NOT NULL DEFAULT 'classic',
      default_convention_card_id TEXT,
      goat_balance INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS goat_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      preview_url TEXT NOT NULL DEFAULT '',
      unlock_type TEXT NOT NULL,
      unlock_threshold INTEGER,
      goat_cost INTEGER
    );

    CREATE TABLE IF NOT EXISTS user_skins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      skin_id TEXT NOT NULL REFERENCES skins(id),
      unlocked_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS convention_cards (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      sections_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS partnerships (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL REFERENCES users(id),
      user_b_id TEXT NOT NULL REFERENCES users(id),
      convention_card_id TEXT REFERENCES convention_cards(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS room_players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      user_id TEXT REFERENCES users(id),
      seat TEXT NOT NULL,
      is_ai INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS game_hands (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      hand_number INTEGER NOT NULL,
      dealer TEXT NOT NULL,
      vulnerability TEXT NOT NULL,
      contract_json TEXT,
      declarer_seat TEXT,
      tricks_made INTEGER,
      score_ns INTEGER NOT NULL DEFAULT 0,
      score_ew INTEGER NOT NULL DEFAULT 0,
      deal_json TEXT,
      bidding_json TEXT,
      play_json TEXT,
      played_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_convention_cards (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      partnership TEXT NOT NULL,
      convention_card_id TEXT NOT NULL REFERENCES convention_cards(id)
    );
  `);

  // Add new columns (safe: wrapped in try/catch since SQLite has no ADD COLUMN IF NOT EXISTS)
  try { sqlite.exec('ALTER TABLE users ADD COLUMN hands_played INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE users ADD COLUMN chips_balance INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE users ADD COLUMN skill_points INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE users ADD COLUMN bleats INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE skins ADD COLUMN chip_cost INTEGER'); } catch { /* already exists */ }

  // Seed / patch skins — all skins use goat currency only (no chips)
  const existing = sqlite.get<{ id: string }>('SELECT id FROM skins WHERE slug = ?', ['classic']);
  if (!existing) {
    const skinsData = [
      { id: uuidv4(), name: 'Classic',   slug: 'classic',   description: 'Navy blue geometric pattern', previewUrl: '/skins/classic.svg',   unlockType: 'default',  goatCost: null },
      { id: uuidv4(), name: 'Ocean',     slug: 'ocean',     description: 'Deep ocean waves',             previewUrl: '/skins/ocean.svg',     unlockType: 'purchase', goatCost: 100  },
      { id: uuidv4(), name: 'Midnight',  slug: 'midnight',  description: 'Starry night sky',             previewUrl: '/skins/midnight.svg',  unlockType: 'purchase', goatCost: 200  },
      { id: uuidv4(), name: 'Gold Foil', slug: 'gold-foil', description: 'Premium gold foil pattern',    previewUrl: '/skins/gold-foil.svg', unlockType: 'purchase', goatCost: 500  },
      { id: uuidv4(), name: 'Crimson',   slug: 'crimson',   description: 'Deep red luxury felt',         previewUrl: '/skins/crimson.svg',   unlockType: 'purchase', goatCost: 200  },
      { id: uuidv4(), name: 'Forest',    slug: 'forest',    description: 'Rich forest green pattern',    previewUrl: '/skins/forest.svg',    unlockType: 'purchase', goatCost: 300  },
    ];
    for (const s of skinsData) {
      sqlite.run(
        'INSERT INTO skins (id, name, slug, description, preview_url, unlock_type, unlock_threshold, goat_cost, chip_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [s.id, s.name, s.slug, s.description, s.previewUrl, s.unlockType, null, s.goatCost, null],
      );
    }
  } else {
    // Patch all skins to goat-only currency
    const patches: { slug: string; unlockType: string; goatCost: number | null }[] = [
      { slug: 'classic',   unlockType: 'default',  goatCost: null },
      { slug: 'ocean',     unlockType: 'purchase', goatCost: 100  },
      { slug: 'midnight',  unlockType: 'purchase', goatCost: 200  },
      { slug: 'gold-foil', unlockType: 'purchase', goatCost: 500  },
      { slug: 'crimson',   unlockType: 'purchase', goatCost: 200  },
      { slug: 'forest',    unlockType: 'purchase', goatCost: 300  },
    ];
    for (const p of patches) {
      const ex = sqlite.get('SELECT id FROM skins WHERE slug = ?', [p.slug]);
      if (ex) {
        sqlite.run(
          'UPDATE skins SET unlock_type = ?, unlock_threshold = ?, goat_cost = ?, chip_cost = NULL WHERE slug = ?',
          [p.unlockType, null, p.goatCost, p.slug],
        );
      } else {
        const id = uuidv4();
        const names: Record<string, string> = { 'gold-foil': 'Gold Foil', crimson: 'Crimson', forest: 'Forest', ocean: 'Ocean', midnight: 'Midnight', classic: 'Classic' };
        sqlite.run(
          'INSERT INTO skins (id, name, slug, description, preview_url, unlock_type, unlock_threshold, goat_cost, chip_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, names[p.slug] ?? p.slug, p.slug, '', `/skins/${p.slug}.svg`, p.unlockType, null, p.goatCost, null],
        );
      }
    }
  }

  try { sqlite.exec(`CREATE TABLE IF NOT EXISTS team_matches (
    id TEXT PRIMARY KEY,
    match_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    host_user_id TEXT NOT NULL REFERENCES users(id),
    board_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'lobby',
    team1_name TEXT NOT NULL DEFAULT 'Team 1',
    team2_name TEXT NOT NULL DEFAULT 'Team 2',
    team1_imps INTEGER NOT NULL DEFAULT 0,
    team2_imps INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  )`); } catch { /* already exists */ }

  try { sqlite.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE users ADD COLUMN can_create_tournament INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

  try { sqlite.exec(`CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    tournament_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    organizer_user_id TEXT NOT NULL REFERENCES users(id),
    board_count INTEGER NOT NULL DEFAULT 8,
    status TEXT NOT NULL DEFAULT 'setup',
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  )`); } catch { /* already exists */ }

  try { sqlite.exec(`CREATE TABLE IF NOT EXISTS tournament_boards (
    id TEXT PRIMARY KEY,
    tournament_code TEXT NOT NULL,
    tournament_name TEXT NOT NULL,
    board_number INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    table_index INTEGER NOT NULL,
    ns_pair_id TEXT NOT NULL,
    ew_pair_id TEXT NOT NULL,
    ns_player1_user_id TEXT,
    ns_player2_user_id TEXT,
    ew_player1_user_id TEXT,
    ew_player2_user_id TEXT,
    ns_display TEXT NOT NULL,
    ew_display TEXT NOT NULL,
    dealer TEXT NOT NULL,
    vulnerability TEXT NOT NULL,
    deal_json TEXT NOT NULL,
    bidding_json TEXT NOT NULL,
    contract_json TEXT NOT NULL,
    declarer_seat TEXT NOT NULL,
    tricks_made INTEGER NOT NULL,
    ns_raw_score INTEGER NOT NULL,
    play_json TEXT NOT NULL,
    played_at INTEGER NOT NULL
  )`); } catch { /* already exists */ }

  // Seed admin user
  try { sqlite.run('UPDATE users SET is_admin = 1, can_create_tournament = 1 WHERE username = ?', ['Johnnybm']); } catch { /* non-fatal */ }

  console.log('Database migrations complete.');
}
