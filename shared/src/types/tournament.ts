export interface PairEntry {
  pairId: string;
  player1: { userId: string; displayName: string };
  player2: { userId: string; displayName: string } | null; // null = bot
}

export interface SwissRoundTable {
  tableIndex: number;
  pair1Id: string; // plays NS
  pair2Id: string; // plays EW
  roomCode: string | null;
  boardsComplete: number;
  complete: boolean;
}

export interface SwissRound {
  roundNumber: number;
  boardStart: number; // 1-indexed board number this round starts at
  boardEnd: number;   // 1-indexed board number this round ends at (inclusive)
  tables: SwissRoundTable[];
  complete: boolean;
}

export interface PairBoardResult {
  boardNumber: number;
  pairId: string;
  side: 'ns' | 'ew';
  rawScore: number;
  matchpoints: number;
}

export interface TournamentStanding {
  pairId: string;
  player1Name: string;
  player2Name: string; // 'Bot' if no player2
  totalMatchpoints: number;
  roundsPlayed: number;
  opponents: string[]; // pairIds already faced
}

export interface TournamentState {
  tournamentCode: string;
  name: string;
  organizerUserId: string;
  totalBoards: number;
  boardsPerRound: number;
  entryFee: number;       // 0 = free
  status: 'setup' | 'in_progress' | 'complete' | 'cancelled';
  pairs: PairEntry[];
  rounds: SwissRound[];
  currentRound: number; // 0 = not started, 1+ = round number
  boardResults: PairBoardResult[];
  standings: TournamentStanding[];
  createdAt: number;
}
