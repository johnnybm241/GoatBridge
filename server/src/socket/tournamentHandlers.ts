import type { Server, Socket } from 'socket.io';
import { sqlite } from '../db/index.js';
import {
  createTournament,
  getTournament,
  toClientTournament,
  addPair,
  removePair,
  startTournament,
} from '../tournaments/tournamentManager.js';
import type { Tournament } from '../tournaments/tournamentManager.js';
import type { SwissRound } from '@goatbridge/shared';
import { logger } from '../logger.js';

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

  socket.on('create_tournament', (payload: { name: string; totalBoards: number; boardsPerRound: number }) => {
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
    if (totalBoards < 2 || totalBoards > 100) {
      socket.emit('room_error', { message: 'Total boards must be between 2 and 100' });
      return;
    }
    if (boardsPerRound < 2 || boardsPerRound > totalBoards) {
      socket.emit('room_error', { message: 'Boards per round must be between 2 and total boards' });
      return;
    }
    const t = createTournament(userId, payload.name.trim(), totalBoards, boardsPerRound);
    socket.join(`tournament:${t.tournamentCode}`);
    logger.info('Tournament created', { tournamentCode: t.tournamentCode, userId, name: t.name, totalBoards, boardsPerRound });
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
    logger.info('Pair added', { tournamentCode: t.tournamentCode, pairId: result.pairId });
    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });

  socket.on('remove_pair_entry', (payload: { tournamentCode: string; pairId: string }) => {
    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.organizerUserId !== userId) { socket.emit('room_error', { message: 'Only the organizer can remove pairs' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }
    removePair(t, payload.pairId);
    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });

  // Any logged-in user can register themselves into an open tournament
  socket.on('join_tournament', (payload: { tournamentCode: string; partnerUserId?: string; partnerDisplayName?: string }) => {
    // Check if banned
    const userRow = sqlite.get<{ username: string; is_banned: number }>('SELECT username, is_banned FROM users WHERE id = ?', [userId]);
    if (!userRow) { socket.emit('room_error', { message: 'User not found' }); return; }
    if (userRow.is_banned) { socket.emit('room_error', { message: 'You are banned from tournaments' }); return; }

    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }

    const result = addPair(t, userId, userRow.username, payload.partnerUserId, payload.partnerDisplayName);
    if (result.error) { socket.emit('room_error', { message: result.error }); return; }

    socket.join(`tournament:${t.tournamentCode}`);
    logger.info('Player self-joined tournament', { tournamentCode: t.tournamentCode, userId, pairId: result.pairId });
    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });

  // Leave (withdraw) from a tournament during setup
  socket.on('leave_tournament_pair', (payload: { tournamentCode: string }) => {
    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }

    const pair = t.pairs.find(p => p.player1.userId === userId || p.player2?.userId === userId);
    if (!pair) { socket.emit('room_error', { message: 'You are not in this tournament' }); return; }

    removePair(t, pair.pairId);
    io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
  });

  socket.on('start_tournament', (payload: { tournamentCode: string }) => {
    const t = getTournament(payload.tournamentCode);
    if (!t) { socket.emit('room_error', { message: 'Tournament not found' }); return; }
    if (t.organizerUserId !== userId) { socket.emit('room_error', { message: 'Only the organizer can start the tournament' }); return; }
    if (t.status !== 'setup') { socket.emit('room_error', { message: 'Tournament has already started' }); return; }

    const result = startTournament(t);
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
