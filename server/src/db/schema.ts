import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  activeCardBackSkin: text('active_card_back_skin').notNull().default('classic'),
  defaultConventionCardId: text('default_convention_card_id'),
  goatBalance: integer('goat_balance').notNull().default(0),
  handsPlayed: integer('hands_played').notNull().default(0),
  skillPoints: integer('skill_points').notNull().default(0),
  bleats: integer('bleats').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
});

export const goatTransactions = sqliteTable('goat_transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  amount: integer('amount').notNull(),
  reason: text('reason', {
    enum: ['hand_played', 'rubber_won', 'slam_bonus', 'daily_login', 'achievement', 'skin_purchase', 'ai_feature', 'admin_grant', 'first_rubber'],
  }).notNull(),
  referenceId: text('reference_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const skins = sqliteTable('skins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  previewUrl: text('preview_url').notNull().default(''),
  unlockType: text('unlock_type', { enum: ['default', 'progress', 'purchase'] }).notNull(),
  unlockThreshold: integer('unlock_threshold'), // hands played needed
  goatCost: integer('goat_cost'),
});

export const userSkins = sqliteTable('user_skins', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  skinId: text('skin_id').notNull().references(() => skins.id),
  unlockedAt: integer('unlocked_at', { mode: 'timestamp_ms' }).notNull(),
});

export const conventionCards = sqliteTable('convention_cards', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  sectionsJson: text('sections_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const partnerships = sqliteTable('partnerships', {
  id: text('id').primaryKey(),
  userAId: text('user_a_id').notNull().references(() => users.id),
  userBId: text('user_b_id').notNull().references(() => users.id),
  conventionCardId: text('convention_card_id').references(() => conventionCards.id),
  status: text('status', { enum: ['pending', 'accepted'] }).notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  roomCode: text('room_code').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => users.id),
  status: text('status', { enum: ['waiting', 'playing', 'complete'] }).notNull().default('waiting'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
});

export const roomPlayers = sqliteTable('room_players', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  userId: text('user_id').references(() => users.id),
  seat: text('seat', { enum: ['north', 'east', 'south', 'west'] }).notNull(),
  isAI: integer('is_ai', { mode: 'boolean' }).notNull().default(false),
});

export const gameHands = sqliteTable('game_hands', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  handNumber: integer('hand_number').notNull(),
  dealer: text('dealer').notNull(),
  vulnerability: text('vulnerability').notNull(),
  contractJson: text('contract_json'),
  declarerSeat: text('declarer_seat'),
  tricksMade: integer('tricks_made'),
  scoreNs: integer('score_ns').notNull().default(0),
  scoreEw: integer('score_ew').notNull().default(0),
  dealJson: text('deal_json'), // stored for training mode
  biddingJson: text('bidding_json'),
  playJson: text('play_json'),
  playedAt: integer('played_at', { mode: 'timestamp_ms' }).notNull(),
});

export const gameConventionCards = sqliteTable('game_convention_cards', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  partnership: text('partnership', { enum: ['ns', 'ew'] }).notNull(),
  conventionCardId: text('convention_card_id').notNull().references(() => conventionCards.id),
});
