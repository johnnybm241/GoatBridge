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

  // Seed default skins
  const existing = sqlite.get<{ id: string }>('SELECT id FROM skins WHERE slug = ?', ['classic']);
  if (!existing) {
    const skinsData = [
      { id: uuidv4(), name: 'Classic', slug: 'classic', description: 'Navy blue geometric pattern', previewUrl: '/skins/classic.svg', unlockType: 'default', unlockThreshold: null, goatCost: null },
      { id: uuidv4(), name: 'Ocean', slug: 'ocean', description: 'Deep ocean waves', previewUrl: '/skins/ocean.svg', unlockType: 'progress', unlockThreshold: 10, goatCost: null },
      { id: uuidv4(), name: 'Midnight', slug: 'midnight', description: 'Starry night sky', previewUrl: '/skins/midnight.svg', unlockType: 'progress', unlockThreshold: 50, goatCost: null },
      { id: uuidv4(), name: 'Gold Foil', slug: 'gold-foil', description: 'Premium gold foil pattern', previewUrl: '/skins/gold-foil.svg', unlockType: 'purchase', unlockThreshold: null, goatCost: 500 },
    ];
    for (const s of skinsData) {
      sqlite.run(
        'INSERT INTO skins (id, name, slug, description, preview_url, unlock_type, unlock_threshold, goat_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [s.id, s.name, s.slug, s.description, s.previewUrl, s.unlockType, s.unlockThreshold, s.goatCost],
      );
    }
  }

  console.log('Database migrations complete.');
}
