import { deal } from '../game/deck.js';
import type { Card } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';

export interface TeamMatchPlayer {
  userId: string;
  displayName: string;
}

export interface TeamMatchBoardResult {
  boardNumber: number;
  t1NsSigned: number | null;  // NS signed score at table 1
  t2NsSigned: number | null;  // NS signed score at table 2
  impsTeam1: number | null;   // positive = team 1 wins, negative = team 2 wins
}

export interface TeamMatch {
  matchCode: string;
  name: string;
  hostUserId: string;
  boardCount: number;
  status: 'lobby' | 'in_progress' | 'complete';
  team1Name: string;
  team2Name: string;
  team1Players: TeamMatchPlayer[];  // up to 4
  team2Players: TeamMatchPlayer[];  // up to 4
  table1RoomCode: string | null;   // Team 1 NS + Team 2 EW
  table2RoomCode: string | null;   // Team 2 NS + Team 1 EW
  preDealtBoards: Array<Record<Seat, Card[]>>;
  boardResults: TeamMatchBoardResult[];
  t1HandsPlayed: number;
  t2HandsPlayed: number;
  totalImpsTeam1: number;
  totalImpsTeam2: number;
  createdAt: number;
}

const matches = new Map<string, TeamMatch>();
const matchByRoom = new Map<string, string>(); // roomCode -> matchCode

function generateMatchCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TM';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function createTeamMatch(hostUserId: string, name: string, boardCount: number): TeamMatch {
  let code = generateMatchCode();
  while (matches.has(code)) code = generateMatchCode();
  const match: TeamMatch = {
    matchCode: code, name, hostUserId, boardCount,
    status: 'lobby',
    team1Name: 'Team 1', team2Name: 'Team 2',
    team1Players: [], team2Players: [],
    table1RoomCode: null, table2RoomCode: null,
    preDealtBoards: [],
    boardResults: [],
    t1HandsPlayed: 0, t2HandsPlayed: 0,
    totalImpsTeam1: 0, totalImpsTeam2: 0,
    createdAt: Date.now(),
  };
  matches.set(code, match);
  return match;
}

export function getTeamMatch(code: string): TeamMatch | undefined {
  return matches.get(code);
}

export function getTeamMatchByRoom(roomCode: string): TeamMatch | undefined {
  const mc = matchByRoom.get(roomCode);
  return mc ? matches.get(mc) : undefined;
}

export function getOpenTeamMatches(): TeamMatch[] {
  return [...matches.values()].filter(m => m.status === 'lobby');
}

export function joinTeamMatchLobby(match: TeamMatch, userId: string, displayName: string, team: 1 | 2): { error?: string } {
  // Remove from any existing team first
  match.team1Players = match.team1Players.filter(p => p.userId !== userId);
  match.team2Players = match.team2Players.filter(p => p.userId !== userId);
  if (team === 1) {
    if (match.team1Players.length >= 4) return { error: 'Team 1 is full' };
    match.team1Players.push({ userId, displayName });
  } else {
    if (match.team2Players.length >= 4) return { error: 'Team 2 is full' };
    match.team2Players.push({ userId, displayName });
  }
  return {};
}

export function leaveTeamMatchLobby(match: TeamMatch, userId: string): void {
  match.team1Players = match.team1Players.filter(p => p.userId !== userId);
  match.team2Players = match.team2Players.filter(p => p.userId !== userId);
}

export function registerMatchRooms(match: TeamMatch, table1RoomCode: string, table2RoomCode: string): void {
  match.table1RoomCode = table1RoomCode;
  match.table2RoomCode = table2RoomCode;
  matchByRoom.set(table1RoomCode, match.matchCode);
  matchByRoom.set(table2RoomCode, match.matchCode);
}

/** Pre-generate all boards for the match */
export function preGenerateBoards(match: TeamMatch): void {
  match.preDealtBoards = [];
  for (let i = 0; i < match.boardCount; i++) {
    match.preDealtBoards.push(deal());
  }
}

/**
 * Record a board result for one table.
 * Returns the completed BoardResult if BOTH tables have now reported this board, otherwise null.
 */
export function recordBoardResult(
  match: TeamMatch,
  roomCode: string,
  boardNumber: number,
  nsSigned: number,
): TeamMatchBoardResult | null {
  let result = match.boardResults.find(r => r.boardNumber === boardNumber);
  if (!result) {
    result = { boardNumber, t1NsSigned: null, t2NsSigned: null, impsTeam1: null };
    match.boardResults.push(result);
  }

  if (roomCode === match.table1RoomCode) {
    result.t1NsSigned = nsSigned;
    match.t1HandsPlayed = Math.max(match.t1HandsPlayed, boardNumber);
  } else if (roomCode === match.table2RoomCode) {
    result.t2NsSigned = nsSigned;
    match.t2HandsPlayed = Math.max(match.t2HandsPlayed, boardNumber);
  }

  if (result.t1NsSigned !== null && result.t2NsSigned !== null && result.impsTeam1 === null) {
    // swing > 0 → Team 1 (NS at T1) gained IMPs
    const swing = result.t1NsSigned - result.t2NsSigned;
    const imps = getImps(Math.abs(swing));
    result.impsTeam1 = swing > 0 ? imps : swing < 0 ? -imps : 0;

    // Recalculate totals
    match.totalImpsTeam1 = 0;
    match.totalImpsTeam2 = 0;
    for (const r of match.boardResults) {
      if (r.impsTeam1 !== null) {
        if (r.impsTeam1 > 0) match.totalImpsTeam1 += r.impsTeam1;
        else if (r.impsTeam1 < 0) match.totalImpsTeam2 += -r.impsTeam1;
      }
    }
    return result;
  }
  return null;
}

function getImps(diff: number): number {
  const table = [0, 20, 50, 90, 130, 170, 220, 270, 320, 370, 430, 500, 600, 750, 900, 1100, 1300, 1500, 1750, 2000, 2250, 2500, 3000, 3500, 4000];
  for (let i = table.length - 1; i >= 0; i--) {
    if (diff >= table[i]!) return i;
  }
  return 0;
}

export function deleteTeamMatch(code: string): void {
  const m = matches.get(code);
  if (m) {
    if (m.table1RoomCode) matchByRoom.delete(m.table1RoomCode);
    if (m.table2RoomCode) matchByRoom.delete(m.table2RoomCode);
  }
  matches.delete(code);
}
