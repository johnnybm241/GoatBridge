import { db, sqlite } from '../db/index.js';
import { users, goatTransactions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

type GoatReason = 'hand_played' | 'rubber_won' | 'slam_bonus' | 'daily_login' | 'achievement' | 'skin_purchase' | 'ai_feature' | 'admin_grant' | 'first_rubber';

export function awardGoats(userId: string, amount: number, reason: GoatReason, referenceId?: string): void {
  const txn = sqlite.transaction(() => {
    sqlite.run('UPDATE users SET goat_balance = goat_balance + ? WHERE id = ?', [amount, userId]);
    sqlite.run(
      'INSERT INTO goat_transactions (id, user_id, amount, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, amount, reason, referenceId ?? null, Date.now()],
    );
  });
  txn();
}

export function spendGoats(userId: string, amount: number, reason: GoatReason, referenceId?: string): void {
  const txn = sqlite.transaction(() => {
    const user = sqlite.get<{ goat_balance: number }>('SELECT goat_balance FROM users WHERE id = ?', [userId]);
    if (!user || user.goat_balance < amount) {
      throw new Error('Insufficient Goat balance');
    }
    sqlite.run('UPDATE users SET goat_balance = goat_balance - ? WHERE id = ?', [amount, userId]);
    sqlite.run(
      'INSERT INTO goat_transactions (id, user_id, amount, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, -amount, reason, referenceId ?? null, Date.now()],
    );
  });
  txn();
}

export function getBalance(userId: string): number {
  const user = sqlite.get<{ goat_balance: number }>('SELECT goat_balance FROM users WHERE id = ?', [userId]);
  return user?.goat_balance ?? 0;
}

export function getTransactionHistory(userId: string, limit = 50, offset = 0) {
  return sqlite.all<{ id: string; amount: number; reason: string; created_at: number }>(
    'SELECT id, amount, reason, created_at FROM goat_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [userId, limit, offset],
  );
}
