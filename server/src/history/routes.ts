import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import type { AuthRequest } from '../auth/middleware.js';
import type { Response } from 'express';
import { sqlite } from '../db/index.js';
import type { TournamentBoardRecord, Seat } from '@goatbridge/shared';

const router = Router();

// All history routes require authentication
router.use(requireAuth);

interface TournamentBoardRow {
  tournament_code: string;
  tournament_name: string;
  board_number: number;
  round_number: number;
  table_index: number;
  ns_pair_id: string;
  ew_pair_id: string;
  ns_player1_user_id: string | null;
  ns_player2_user_id: string | null;
  ew_player1_user_id: string | null;
  ew_player2_user_id: string | null;
  ns_display: string;
  ew_display: string;
  dealer: string;
  vulnerability: string;
  deal_json: string;
  bidding_json: string;
  contract_json: string;
  declarer_seat: string;
  tricks_made: number;
  ns_raw_score: number;
  play_json: string;
  played_at: number;
}

function rowToBoard(row: TournamentBoardRow): TournamentBoardRecord {
  return {
    boardNumber: row.board_number,
    roundNumber: row.round_number,
    tableIndex: row.table_index,
    nsPairId: row.ns_pair_id,
    ewPairId: row.ew_pair_id,
    dealer: row.dealer as Seat,
    vulnerability: row.vulnerability,
    deal: JSON.parse(row.deal_json),
    biddingCalls: JSON.parse(row.bidding_json),
    contract: JSON.parse(row.contract_json),
    declarerSeat: row.declarer_seat as Seat,
    tricksMade: row.tricks_made,
    nsRawScore: row.ns_raw_score,
    completedTricks: JSON.parse(row.play_json),
  };
}

// GET /history — list all tournaments the user participated in (from DB)
router.get('/', (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  // Find distinct tournaments where this user played (as any of the 4 player slots)
  const rows = sqlite.all<{
    tournament_code: string;
    tournament_name: string;
    board_count: number;
    played_at: number;
  }>(
    `SELECT tournament_code, tournament_name,
            COUNT(*) as board_count,
            MAX(played_at) as played_at
     FROM tournament_boards
     WHERE ns_player1_user_id = ?
        OR ns_player2_user_id = ?
        OR ew_player1_user_id = ?
        OR ew_player2_user_id = ?
     GROUP BY tournament_code, tournament_name
     ORDER BY MAX(played_at) DESC`,
    [userId, userId, userId, userId],
  );

  res.json({ tournaments: rows });
});

// GET /history/:code/boards — full board records for one tournament (from DB)
router.get('/:code/boards', (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const code = req.params.code;

  // Verify user participated in this tournament
  const check = sqlite.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM tournament_boards
     WHERE tournament_code = ?
       AND (ns_player1_user_id = ? OR ns_player2_user_id = ? OR ew_player1_user_id = ? OR ew_player2_user_id = ?)`,
    [code, userId, userId, userId, userId],
  );

  if (!check || check.cnt === 0) {
    res.status(404).json({ error: 'Tournament not found in your history' });
    return;
  }

  const rows = sqlite.all<TournamentBoardRow>(
    `SELECT * FROM tournament_boards
     WHERE tournament_code = ?
     ORDER BY board_number ASC`,
    [code],
  );

  const boards = rows.map(rowToBoard);
  res.json({ boards });
});

export default router;
