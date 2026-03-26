import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import type { SwissRound } from '@goatbridge/shared';
import { sqlite } from '../db/index.js';
import {
  getOpenTournaments,
  startTournament,
  cancelTournament,
  toClientTournament,
} from './tournamentManager.js';
import type { Tournament } from './tournamentManager.js';
import { logger } from '../logger.js';

/** Credit Goats to a user (scheduler-local helper). */
function creditGoats(userId: string, amount: number, reason: string): void {
  if (amount <= 0) return;
  sqlite.run('UPDATE users SET goat_balance = goat_balance + ? WHERE id = ?', [amount, userId]);
  sqlite.run(
    'INSERT INTO goat_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    [uuidv4(), userId, amount, reason, Date.now()],
  );
}

/**
 * Start the background scheduler that auto-starts tournaments whose
 * scheduledStartAt time has passed.  Runs every 30 seconds.
 */
export function startScheduler(
  io: Server,
  startTournamentMatch: (tournament: Tournament, round: SwissRound, tableIndex: number) => void,
): void {
  setInterval(() => {
    const now = Date.now();

    for (const t of getOpenTournaments()) {
      if (t.status !== 'setup') continue;
      if (!t.scheduledStartAt || t.scheduledStartAt > now) continue;

      logger.info('Auto-starting scheduled tournament', {
        tournamentCode: t.tournamentCode,
        name: t.name,
        pairs: t.pairs.length,
        scheduledStartAt: t.scheduledStartAt,
      });

      const result = startTournament(t);

      if (result.cancelled) {
        const refunds = cancelTournament(t);
        for (const entry of refunds) {
          creditGoats(entry.userId, entry.amount, `Tournament cancelled (not enough players): ${t.name}`);
        }
        logger.info('Scheduled tournament auto-cancelled — not enough pairs', {
          tournamentCode: t.tournamentCode,
          pairs: t.pairs.length,
        });
        io.to(`tournament:${t.tournamentCode}`).emit('tournament_cancelled', { tournamentCode: t.tournamentCode });
        io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
        continue;
      }

      if (result.error) {
        logger.error('Scheduled tournament failed to start', {
          tournamentCode: t.tournamentCode,
          error: result.error,
        });
        continue;
      }

      logger.info('Scheduled tournament started', {
        tournamentCode: t.tournamentCode,
        pairs: t.pairs.length,
        round1Tables: t.rounds[0]?.tables.length ?? 0,
      });

      // Start all tables in round 1
      const round1 = t.rounds[0];
      if (round1) {
        for (let i = 0; i < round1.tables.length; i++) {
          startTournamentMatch(t, round1, i);
        }
      }

      io.to(`tournament:${t.tournamentCode}`).emit('tournament_updated', { tournament: toClientTournament(t) });
    }
  }, 30_000);
}
