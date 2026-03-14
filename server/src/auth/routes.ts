import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { sqlite } from '../db/index.js';
import { hashPassword, comparePassword, signToken } from './service.js';
import type { AuthRequest } from './middleware.js';
import { requireAuth } from './middleware.js';

const router = Router();

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  active_card_back_skin: string;
  goat_balance: number;
}

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body as { username?: string; email?: string; password?: string };

  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email, and password are required' });
    return;
  }
  if (username.length < 3 || username.length > 20) {
    res.status(400).json({ error: 'Username must be 3–20 characters' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const existing = sqlite.get<UserRow>('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const emailExisting = sqlite.get<UserRow>('SELECT id FROM users WHERE email = ?', [email]);
  if (emailExisting) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const id = uuidv4();
  const now = Date.now();

  sqlite.run(
    'INSERT INTO users (id, username, email, password_hash, active_card_back_skin, goat_balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, username, email, passwordHash, 'classic', 0, now],
  );

  const token = signToken({ userId: id, username });
  res.status(201).json({ token, userId: id, username });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const user = sqlite.get<UserRow>('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  sqlite.run('UPDATE users SET last_login_at = ? WHERE id = ?', [Date.now(), user.id]);

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, userId: user.id, username: user.username });
});

router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const user = sqlite.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.userId!]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    userId: user.id,
    username: user.username,
    email: user.email,
    activeCardBackSkin: user.active_card_back_skin,
    goatBalance: user.goat_balance,
  });
});

export default router;
