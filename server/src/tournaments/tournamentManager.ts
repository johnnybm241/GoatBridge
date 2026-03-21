import { deal } from '../game/deck.js';
import type { Card } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import type {
  PairEntry,
  SwissRound,
  SwissRoundTable,
  PairBoardResult,
  TournamentStanding,
} from '@goatbridge/shared';

export interface Tournament {
  tournamentCode: string;
  name: string;
  organizerUserId: string;
  totalBoards: number;
  boardsPerRound: number;
  status: 'setup' | 'in_progress' | 'complete';
  pairs: PairEntry[];
  rounds: SwissRound[];
  currentRound: number; // 0 = not started, 1+ = round number
  boardResults: PairBoardResult[];
  standings: TournamentStanding[];
  createdAt: number;
  // Server-only: pre-dealt boards indexed 0 = board 1
  preDealtBoards: Array<Record<Seat, Card[]>>;
}

const tournaments = new Map<string, Tournament>();

// Maps roomCode -> { tournamentCode, roundNumber, tableIndex }
const tournamentByRoom = new Map<string, { tournamentCode: string; roundNumber: number; tableIndex: number }>();

// Callback registry for starting a new round from outside this module
type StartRoundFn = (tournament: Tournament, roundNumber: number) => void;
let _startRoundFn: StartRoundFn | null = null;

export function registerStartRoundFn(fn: StartRoundFn): void {
  _startRoundFn = fn;
}

export function callStartRoundFn(t: Tournament, roundNumber: number): void {
  _startRoundFn?.(t, roundNumber);
}

function generateTournamentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TN';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generatePairId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'PR';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function createTournament(
  organizerUserId: string,
  name: string,
  totalBoards: number,
  boardsPerRound: number,
): Tournament {
  let code = generateTournamentCode();
  while (tournaments.has(code)) code = generateTournamentCode();

  const tournament: Tournament = {
    tournamentCode: code,
    name,
    organizerUserId,
    totalBoards,
    boardsPerRound,
    status: 'setup',
    pairs: [],
    rounds: [],
    currentRound: 0,
    boardResults: [],
    standings: [],
    createdAt: Date.now(),
    preDealtBoards: [],
  };
  tournaments.set(code, tournament);
  return tournament;
}

export function getTournament(code: string): Tournament | undefined {
  return tournaments.get(code);
}

/** Strip server-only preDealtBoards before sending to clients. */
export function toClientTournament(t: Tournament): Omit<Tournament, 'preDealtBoards'> {
  const { preDealtBoards: _ignored, ...clientSafe } = t;
  return clientSafe;
}

export function getOpenTournaments(): Tournament[] {
  return [...tournaments.values()].filter(t => t.status !== 'complete');
}

export function addPair(
  t: Tournament,
  p1UserId: string,
  p1Name: string,
  p2UserId?: string,
  p2Name?: string,
): { pairId?: string; error?: string } {
  if (t.pairs.length >= 32) return { error: 'Tournament is full (max 32 pairs)' };
  // Check player1 not already in a pair
  if (t.pairs.some(p => p.player1.userId === p1UserId || p.player2?.userId === p1UserId)) {
    return { error: 'Player 1 is already in a pair' };
  }
  if (p2UserId && t.pairs.some(p => p.player1.userId === p2UserId || p.player2?.userId === p2UserId)) {
    return { error: 'Player 2 is already in a pair' };
  }

  let pairId = generatePairId();
  while (t.pairs.some(p => p.pairId === pairId)) pairId = generatePairId();

  const pair: PairEntry = {
    pairId,
    player1: { userId: p1UserId, displayName: p1Name },
    player2: p2UserId && p2Name ? { userId: p2UserId, displayName: p2Name } : null,
  };
  t.pairs.push(pair);
  return { pairId };
}

export function removePair(t: Tournament, pairId: string): void {
  t.pairs = t.pairs.filter(p => p.pairId !== pairId);
}

export function startTournament(t: Tournament): { error?: string } {
  if (t.pairs.length < 2) return { error: 'Need at least 2 pairs to start' };

  // Pre-deal all boards upfront
  t.preDealtBoards = [];
  for (let i = 0; i < t.totalBoards; i++) {
    t.preDealtBoards.push(deal());
  }

  // Initialize standings
  t.standings = t.pairs.map(pair => ({
    pairId: pair.pairId,
    player1Name: pair.player1.displayName,
    player2Name: pair.player2?.displayName ?? 'Bot',
    totalMatchpoints: 0,
    roundsPlayed: 0,
    opponents: [],
  }));

  t.status = 'in_progress';
  t.currentRound = 0;

  // Generate round 1
  generateNextRound(t);

  return {};
}

export function generateNextRound(t: Tournament): void {
  const nextRoundNumber = t.rounds.length + 1;
  const boardsAlreadyUsed = (nextRoundNumber - 1) * t.boardsPerRound;
  if (boardsAlreadyUsed >= t.totalBoards) {
    // No more boards — tournament is complete
    t.status = 'complete';
    return;
  }

  const boardStart = boardsAlreadyUsed + 1;
  const boardEnd = Math.min(boardStart + t.boardsPerRound - 1, t.totalBoards);

  // Sort standings descending by matchpoints
  const sorted = [...t.standings].sort((a, b) => b.totalMatchpoints - a.totalMatchpoints);

  // Build pairing using Swiss algorithm
  const tables: SwissRoundTable[] = [];
  const paired = new Set<string>();

  // Track which side each pair played last round
  const lastNSPairs = new Set<string>();
  if (t.rounds.length > 0) {
    const lastRound = t.rounds[t.rounds.length - 1]!;
    for (const table of lastRound.tables) {
      lastNSPairs.add(table.pair1Id);
    }
  }

  // Try to pair avoiding rematches
  const tryPair = (list: typeof sorted): SwissRoundTable[] => {
    const result: SwissRoundTable[] = [];
    const used = new Set<string>();

    for (let i = 0; i < list.length; i++) {
      if (used.has(list[i]!.pairId)) continue;
      // Try to find first unpaired opponent not already faced
      let found = false;
      for (let j = i + 1; j < list.length; j++) {
        if (used.has(list[j]!.pairId)) continue;
        const alreadyFaced = list[i]!.opponents.includes(list[j]!.pairId);
        if (!alreadyFaced) {
          used.add(list[i]!.pairId);
          used.add(list[j]!.pairId);
          // Determine NS/EW: pair that played NS last time plays EW this time
          const p1 = list[i]!.pairId;
          const p2 = list[j]!.pairId;
          const pair1IsNS = lastNSPairs.has(p2) || !lastNSPairs.has(p1);
          result.push({
            tableIndex: result.length,
            pair1Id: pair1IsNS ? p1 : p2,
            pair2Id: pair1IsNS ? p2 : p1,
            roomCode: null,
            boardsComplete: 0,
            complete: false,
          });
          found = true;
          break;
        }
      }
      if (!found) {
        // All remaining opponents have been faced — pair with closest in standings anyway
        for (let j = i + 1; j < list.length; j++) {
          if (used.has(list[j]!.pairId)) continue;
          used.add(list[i]!.pairId);
          used.add(list[j]!.pairId);
          const p1 = list[i]!.pairId;
          const p2 = list[j]!.pairId;
          const pair1IsNS = lastNSPairs.has(p2) || !lastNSPairs.has(p1);
          result.push({
            tableIndex: result.length,
            pair1Id: pair1IsNS ? p1 : p2,
            pair2Id: pair1IsNS ? p2 : p1,
            roomCode: null,
            boardsComplete: 0,
            complete: false,
          });
          break;
        }
      }
    }
    return result;
  };

  const newTables = tryPair(sorted);

  // Handle bye if odd number of pairs (last unpaired pair gets a bot table)
  for (const standing of sorted) {
    if (!paired.has(standing.pairId) && !newTables.some(tbl => tbl.pair1Id === standing.pairId || tbl.pair2Id === standing.pairId)) {
      // Create a bot pair for the bye
      const botPairId = 'BOT_BYE';
      newTables.push({
        tableIndex: newTables.length,
        pair1Id: standing.pairId,
        pair2Id: botPairId,
        roomCode: null,
        boardsComplete: 0,
        complete: false,
      });
    }
  }

  // Re-index tables
  newTables.forEach((tbl, idx) => { tbl.tableIndex = idx; });

  const newRound: SwissRound = {
    roundNumber: nextRoundNumber,
    boardStart,
    boardEnd,
    tables: newTables,
    complete: false,
  };

  t.rounds.push(newRound);
  t.currentRound = nextRoundNumber;
}

export function recordBoardResult(
  t: Tournament,
  boardNumber: number,
  nsRawScore: number,
  nsPairId: string,
  ewPairId: string,
): void {
  // Remove any existing results for this board+pair combination
  t.boardResults = t.boardResults.filter(
    r => !(r.boardNumber === boardNumber && (r.pairId === nsPairId || r.pairId === ewPairId)),
  );

  t.boardResults.push({
    boardNumber,
    pairId: nsPairId,
    side: 'ns',
    rawScore: nsRawScore,
    matchpoints: 0,
  });
  t.boardResults.push({
    boardNumber,
    pairId: ewPairId,
    side: 'ew',
    rawScore: -nsRawScore, // EW perspective is flipped
    matchpoints: 0,
  });

  recalcMatchpoints(t, boardNumber);
}

export function recalcMatchpoints(t: Tournament, boardNumber: number): void {
  // Get all NS results for this board
  const nsResults = t.boardResults.filter(r => r.boardNumber === boardNumber && r.side === 'ns');

  // For each NS result, compare against all other NS scores on this board
  for (const result of nsResults) {
    let mp = 0;
    for (const other of nsResults) {
      if (other.pairId === result.pairId) continue;
      if (result.rawScore > other.rawScore) mp += 2;
      else if (result.rawScore === other.rawScore) mp += 1;
    }
    result.matchpoints = mp;
  }

  // EW matchpoints are the inverse: EW wins when NS loses
  const ewResults = t.boardResults.filter(r => r.boardNumber === boardNumber && r.side === 'ew');
  // EW rawScore is -nsRawScore, so higher EW rawScore = better for EW
  for (const result of ewResults) {
    let mp = 0;
    for (const other of ewResults) {
      if (other.pairId === result.pairId) continue;
      if (result.rawScore > other.rawScore) mp += 2;
      else if (result.rawScore === other.rawScore) mp += 1;
    }
    result.matchpoints = mp;
  }
}

export function recalcStandings(t: Tournament): void {
  const standingMap = new Map<string, TournamentStanding>();
  for (const pair of t.pairs) {
    standingMap.set(pair.pairId, {
      pairId: pair.pairId,
      player1Name: pair.player1.displayName,
      player2Name: pair.player2?.displayName ?? 'Bot',
      totalMatchpoints: 0,
      roundsPlayed: 0,
      opponents: [],
    });
  }

  // Sum matchpoints
  for (const result of t.boardResults) {
    const standing = standingMap.get(result.pairId);
    if (standing) standing.totalMatchpoints += result.matchpoints;
  }

  // Count rounds played and opponents
  for (const round of t.rounds) {
    if (!round.complete) continue;
    for (const table of round.tables) {
      const s1 = standingMap.get(table.pair1Id);
      const s2 = standingMap.get(table.pair2Id);
      if (s1) {
        s1.roundsPlayed++;
        if (!s1.opponents.includes(table.pair2Id)) s1.opponents.push(table.pair2Id);
      }
      if (s2) {
        s2.roundsPlayed++;
        if (!s2.opponents.includes(table.pair1Id)) s2.opponents.push(table.pair1Id);
      }
    }
  }

  t.standings = [...standingMap.values()].sort((a, b) => b.totalMatchpoints - a.totalMatchpoints);
}

export function checkRoundComplete(t: Tournament, roundNumber: number): boolean {
  const round = t.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) return false;
  return round.tables.every(tbl => tbl.complete);
}

export function markTableComplete(
  t: Tournament,
  roundNumber: number,
  tableIndex: number,
  onRoundComplete: (t: Tournament) => void,
): void {
  const round = t.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) return;
  const table = round.tables[tableIndex];
  if (!table) return;

  table.complete = true;

  if (checkRoundComplete(t, roundNumber)) {
    round.complete = true;
    recalcStandings(t);

    // Check if all boards used up
    const totalBoardsInCompletedRounds = t.rounds.filter(r => r.complete).length * t.boardsPerRound;
    if (totalBoardsInCompletedRounds >= t.totalBoards) {
      t.status = 'complete';
    } else {
      // Generate next round and start it
      generateNextRound(t);
    }

    onRoundComplete(t);
  }
}

export function linkTableToTournament(
  roomCode: string,
  tournamentCode: string,
  roundNumber: number,
  tableIndex: number,
): void {
  tournamentByRoom.set(roomCode, { tournamentCode, roundNumber, tableIndex });
}

export function getTournamentByRoom(
  roomCode: string,
): { tournamentCode: string; roundNumber: number; tableIndex: number } | undefined {
  return tournamentByRoom.get(roomCode);
}

// Legacy compatibility — keep for gameHandlers.ts which checks for team match tournament links
// These are no longer used by pairs tournaments but kept to avoid breaking team match code
export function getTournamentMatchByTeamMatch(_teamMatchCode: string): undefined {
  return undefined;
}

export function recordTournamentMatchResult(_t: Tournament, _matchId: string, _impsTeam1: number, _impsTeam2: number): void {
  // No-op: team match format removed
}
