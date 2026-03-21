import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from './service.js';
import { sqlite } from '../db/index.js';

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const user = sqlite.get<{ is_admin: number }>('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
  if (!user || !user.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
