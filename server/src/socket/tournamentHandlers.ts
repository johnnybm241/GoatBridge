import { v4 as uuidv4 } from 'uuid';
import type { Server, Socket } from 'socket.io';
import { sqlite } from '../db/index.js';
import {
  createTournament,
  getTournament,
  toClientTournament,
  addPair,
  removePair,
  startTournament,
  recordEntryPayment,
  removeEntryPayment,
  cancelTournament,
} from '../tournaments/tournamentManager.js';
import type { Tournament } from '../tournaments/tournamentManager.js';
import type { SwissRound } from '@goatbridge/shared';
import { logger } from '../logger.js';

/** Deduct Goats from a user. Returns false if insufficient balance. */
function deductGoats(userId: string, amount: number, reason: string): boolean {
  if (amount <= 0) return true;
  const row = sqlite.get<{ goat_balance: number }>('SELECT goat_balance FROM users WHERE id = ?', [userId]);
  if (!row || row.goat_balance < amount) return false;
  sqlite.run('UPDATE users SET goat_balance = goat_balance - ? WHERE id = ?', [amount, userId]);
  sqlite.run(
    'INSERT INTO goat_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    [uuidv4(), userId, -amount, reason, Date.now()],
  );
  return true;
}

/** Credit Goats to a user. */
function creditGoats(userId: string, amount: number, reason: string): void {
  if (amount <= 0) return;
  sqlite.run('UPDATE users SET goat_balance = goat_balance + ? WHERE id = ?', [amount, userId]);
  sqlite.run(
    'INSERT INTO goat_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    [uuidv4(), userId, amount, reason, Date.now()],
  );
}

export function setupTournamentHandlers(
  io: Server,
  socket: Socket & { data: { userId: string; username: string } },
  startTournamentMatch: (tournament: Tournament, round: SwissRound, tableIndex: number) => void,
): void {
  const { userId } = socket.data;

  socket.on('join_tournament_lobby', (payload: { tournamentCode: string }) => {
    const t = getTournament(payload.tournamentCode);
    if (!t) {
      socket.emit('room_error', { message: 'Tournament not found' });
      return;
    }
    socket.join(`tournament:${t.tournamentCode}`);
    socket.emit('tournament_state', { tournament: toClientTournament(t) });
  });

  socket.on('leave_tournament_lobby', (payload: { tournamentCode: string }) => {
    socket.leave(`tournament:${payload.tournamentCode}`);
  });

  socket.on('create_tournament', (payload: { name: string; totalBoards: number; boardsPerRound: number; entryFee?: number; scheduledStartAt?: number }) => {
    if (!payload.name?.trim()) {
      socket.emit('room_error', { message: 'Tournament name is required' });
      return;
    }
    const row = sqlite.get<{ can_create_tournament: number }>('SELECT can_create_tournament FROM users WHERE id = ?', [userId]);
    if (!row?.can_create_tournament) {
      socket.emit('room_error', { message: 'You do not have permission to create tournaments' });
      return;
    }
    const totalBoards = Number(payload.totalBoards) || 16;
    const boardsPerRound = Number(payload.boardsPerRound) || 4;
    const entryFee = Math.max(0, Math.floor(Number(payload.entryFee) || 0));
    const scheduledStartAt = payload.scheduledStartAt ? Number(payload.scheduledStartAt) : undefined;
    if (totalBoards < 2 || totalBoards > 100) {
      socket.emit('room_error', { message: 'Total boards must be between 2 and 100' });
      return;
    }
    if (boardsPerRound < 2 || boardsPerRound > totalBoards) {
      socket.emit('room_error', { message: 'Boards per round must be between 2 and total boards' });
      return;
    }
    if (scheduledStartAt && scheduledStartAt <= Date.now()) {
      socket.emit('room_error', { message: 'Scheduled start time must be in the future' });
      return;
    }
    const t = createTournament(userId, payload.name.trim(), totalBoards, boardsPerRound, entryFee, scheduledStartAt);
    socket.join(`tournament:${t.tournamentCode}`);
    logger.info('Tournament created', { tournamentCode: t.tournamentCode, userId, name: t.name, totalBoards, boardsPerRound, entryFee, scheduledStartAt });
    socket.emit('tournament_state', { tournament: toClientTournament(t) });
  });

  socket.on('add_pair_entry', (payload: {
    tournamentCode: string;
    player1UserId: string;
    player1DisplayName: string;
    player2UserId?: string;
    player2DisplayName?: string;
  }) => {
    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.organizerUserId !== userId) { socket.emit('room_error', { message: 'Only the organizer can add pairs' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }

    const result = addPair(t, payload.player1UserId, payload.player1DisplayName, payload.player2UserId, payload.player2DisplayName);
    if (result.error) { socket.emit('room_error', { message: result.error }); return; }
    logger.info('Pair added by organizer', { tournamentCode: t.tournamentCode, pairId: result.pairId });
    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });

  socket.on('remove_pair_entry', (payload: { tournamentCode: string; pairId: string }) => {
    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.organizerUserId !== userId) { socket.emit('room_error', { message: 'Only the organizer can remove pairs' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }

    // Refund entry fee if the organizer removes a pair that paid
    const refundAmount = removeEntryPayment(t, payload.pairId);
    const removedPair = t.pairs.find(p => p.pairId === payload.pairId);
    if (refundAmount > 0 && removedPair) {
      creditGoats(removedPair.player1.userId, refundAmount, `Tournament entry refund: ${t.name}`);
    }

    removePair(t, payload.pairId);
    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });

  // Any logged-in user can register themselves into an open tournament
  socket.on('join_tournament', (payload: { tournamentCode: string; partnerUserId?: string; partnerDisplayName?: string }) => {
    const userRow = sqlite.get<{ username: string; is_banned: number; goat_balance: number }>(
      'SELECT username, is_banned, goat_balance FROM users WHERE id = ?', [userId],
    );
    if (!userRow) { socket.emit('room_error', { message: 'User not found' }); return; }
    if (userRow.is_banned) { socket.emit('room_error', { message: 'You are banned from tournaments' }); return; }

    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }

    // Deduct entry fee
    if (t.entryFee > 0) {
      const ok = deductGoats(userId, t.entryFee, `Tournament entry: ${t.name}`);
      if (!ok) {
        socket.emit('room_error', { message: `Insufficient Goats. Entry fee is ${t.entryFee} 🐐` });
        return;
      }
    }

    const result = addPair(t, userId, userRow.username, payload.partnerUserId, payload.partnerDisplayName);
    if (result.error) {
      // Refund immediately if addPair failed after deducting
      if (t.entryFee > 0) creditGoats(userId, t.entryFee, `Tournament entry refund: ${t.name}`);
      socket.emit('room_error', { message: result.error });
      return;
    }

    if (t.entryFee > 0 && result.pairId) {
      recordEntryPayment(t, userId, result.pairId, t.entryFee);
    }

    socket.join(`tournament:${t.tournamentCode}`);
    logger.info('Player self-joined tournament', { tournamentCode: t.tournamentCode, userId, pairId: result.pairId });
    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });

  // Withdraw from a tournament during setup — always refunds entry fee
  socket.on('leave_tournament_pair', (payload: { tournamentCode: string }) => {
    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }

    const pair = t.pairs.find(p => p.player1.userId === userId || p.player2?.userId === userId);
    if (!pair) { socket.emit('room_error', { message: 'You are not in this tournament' }); return; }

    const refundAmount = removeEntryPayment(t, pair.pairId);
    if (refundAmount > 0) {
      creditGoats(userId, refundAmount, `Tournament withdrawal refund: ${t.name}`);
    }

    removePair(t, pair.pairId);
    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });

  socket.on('start_tournament', (payload: { tournamentCode: string }) => {
    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.organizerUserId !== userId) { socket.emit('room_error', { message: 'Only the organizer can start the tournament' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }

    const result = startTournament(t);

    // Auto-cancel: fewer than 2 pairs → refund everyone and close
    if (result.cancelled) {
      const refunds = cancelTournament(t);
      for (const entry of refunds) {
        creditGoats(entry.userId, entry.amount, `Tournament cancelled (not enough players): ${t.name}`);
      }
      logger.info('Tournament auto-cancelled — not enough pairs', { tournamentCode: t.tournamentCode, pairs: t.pairs.length });
      io.to(`tournament:${t.tournamentCode}`).emit('tournament_cancelled', { tournamentCode: t.tournamentCode });
      io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
      return;
    }

    if (result.error) { socket.emit('room_error', { message: result.error }); return; }

    logger.info('Tournament started', { tournamentCode: t.tournamentCode, pairs: t.pairs.length, round1Tables: t.rounds[0]?.tables.length ?? 0 });

    // Start all tables in round 1
    const round1 = t.rounds[0];
    if (round1) {
      for (let i = 0; i < round1.tables.length; i++) {
        startTournamentMatch(t, round1, i);
      }
    }

    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });
}
