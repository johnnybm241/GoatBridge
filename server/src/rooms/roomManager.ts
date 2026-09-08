import type { Seat, SeatInfo, TableSummary, TableVisibility } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import type { GameRoom } from '../game/stateMachine.js';
import { v4 as uuidv4 } from 'uuid';

const rooms = new Map<string, GameRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function makeEmptySeat(seat: Seat): SeatInfo {
  return {
    seat,
    userId: null,
    displayName: '',
    isAI: false,
    isConnected: false,
    disconnected: false,
    disconnectedAt: null,
    originalUserId: null,
    activeCardBackSkin: 'classic',
    joinedAt: null,
  };
}

export function createRoom(hostUserId: string, visibility: TableVisibility = 'public'): GameRoom {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();

  const seats: Record<Seat, SeatInfo> = {
    north: makeEmptySeat('north'),
    east: makeEmptySeat('east'),
    south: makeEmptySeat('south'),
    west: makeEmptySeat('west'),
  };

  const room: GameRoom = {
    roomCode: code,
    hostUserId,
    seats,
    kibitzingAllowed: true,
    spectators: [],
    game: null,
    hands: { north: [], east: [], south: [], west: [] },
    undoStack: [],
    visibility,
    invitedUserIds: [],
  };

  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function findSeatByUserId(room: GameRoom, userId: string): Seat | null {
  for (const seat of SEATS) {
    if (room.seats[seat].userId === userId) return seat;
  }
  return null;
}

export function joinSeat(
  room: GameRoom,
  userId: string,
  displayName: string,
  skin: string,
  seat?: Seat,
): { seat: Seat } | { error: string } {
  // Check already seated (including reconnect after disconnect)
  const existingSeat = findSeatByUserId(room, userId);
  if (existingSeat) {
    room.seats[existingSeat].isConnected = true;
    room.seats[existingSeat].disconnected = false;
    room.seats[existingSeat].disconnectedAt = null;
    return { seat: existingSeat };
  }

  // Assign to requested seat or first available
  const targetSeat = seat ?? SEATS.find(s => !room.seats[s].userId && !room.seats[s].isAI);
  if (!targetSeat) return { error: 'No seats available' };
  if (room.seats[targetSeat].userId || room.seats[targetSeat].isAI) {
    return { error: 'Seat already taken' };
  }

  room.seats[targetSeat] = {
    seat: targetSeat,
    userId,
    displayName,
    isAI: false,
    isConnected: true,
    disconnected: false,
    disconnectedAt: null,
    originalUserId: null,
    activeCardBackSkin: skin,
    joinedAt: Date.now(),
  };

  return { seat: targetSeat };
}

export function addBot(room: GameRoom, seat: Seat): boolean {
  if (room.seats[seat].userId || room.seats[seat].isAI) return false;
  const botNames = ['Garry Bot', 'Magnus Bot', 'Judy Bot', 'Omar Bot'];
  const botName = botNames[SEATS.indexOf(seat)] ?? 'AI Bot';

  room.seats[seat] = {
    seat,
    userId: `bot-${seat}`,
    displayName: botName,
    isAI: true,
    isConnected: true,
    disconnected: false,
    disconnectedAt: null,
    originalUserId: null,
    activeCardBackSkin: 'classic',
    joinedAt: null,
  };
  return true;
}

export function removeBot(room: GameRoom, seat: Seat): boolean {
  if (!room.seats[seat].isAI) return false;
  room.seats[seat] = makeEmptySeat(seat);
  return true;
}

export function isFull(room: GameRoom): boolean {
  return SEATS.every(s => room.seats[s].userId !== null || room.seats[s].isAI);
}

/** True when the user may take a seat: public table, host, or explicitly invited/approved. */
export function canJoinTable(room: GameRoom, userId: string): boolean {
  if (room.visibility === 'public') return true;
  if (room.hostUserId === userId) return true;
  return room.invitedUserIds.includes(userId);
}

export function inviteUser(room: GameRoom, userId: string): void {
  if (!room.invitedUserIds.includes(userId)) room.invitedUserIds.push(userId);
}

/** Clears a seat, keeping the room's seat map shape intact. */
export function vacateSeat(room: GameRoom, seat: Seat): void {
  room.seats[seat] = makeEmptySeat(seat);
}

/**
 * Picks the next host when the current one leaves: the human who has been
 * seated longest. Returns the new host's seat, or null when no human remains
 * (the caller is then expected to delete the room).
 */
export function reassignHost(room: GameRoom): { userId: string; displayName: string } | null {
  const candidates = SEATS
    .map(s => room.seats[s])
    .filter(info => info.userId && !info.isAI && info.joinedAt !== null)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));

  const next = candidates[0];
  if (next?.userId) {
    room.hostUserId = next.userId;
    return { userId: next.userId, displayName: next.displayName };
  }

  // Fall back to the longest-standing spectator so the table keeps an owner.
  const spectator = room.spectators[0];
  if (spectator) {
    room.hostUserId = spectator.userId;
    return { userId: spectator.userId, displayName: spectator.displayName };
  }
  return null;
}

/** True when nobody human is left at the table (seated or watching). */
export function isAbandoned(room: GameRoom): boolean {
  const humanSeated = SEATS.some(s => room.seats[s].userId && !room.seats[s].isAI);
  return !humanSeated && room.spectators.length === 0;
}

/** Tables shown in the lobby browser: public ones, plus invite-only tables the user may enter. */
export function listJoinableTables(userId: string): TableSummary[] {
  const summaries: TableSummary[] = [];

  for (const [code, room] of rooms) {
    // Team match and tournament tables are managed by their own flows.
    if (room.teamMatchCode || room.pairsTournamentCode) continue;

    const invited = room.invitedUserIds.includes(userId);
    if (room.visibility === 'invite_only' && !invited && room.hostUserId !== userId) continue;

    const players = SEATS
      .filter(s => room.seats[s].userId)
      .map(s => ({ seat: s, displayName: room.seats[s].displayName, isAI: room.seats[s].isAI }));

    const hostSeat = SEATS.find(s => room.seats[s].userId === room.hostUserId);
    const hostName = hostSeat
      ? room.seats[hostSeat].displayName
      : room.spectators.find(s => s.userId === room.hostUserId)?.displayName ?? 'Host';

    summaries.push({
      roomCode: code,
      hostUserId: room.hostUserId,
      hostName,
      visibility: room.visibility,
      phase: room.game?.phase ?? 'waiting',
      kibitzingAllowed: room.kibitzingAllowed,
      spectatorCount: room.spectators.length,
      openSeats: SEATS.filter(s => !room.seats[s].userId && !room.seats[s].isAI).length,
      players,
      invited,
    });
  }

  return summaries;
}

/** Scans all in-memory rooms for where a user is currently seated or spectating. */
export function findUserRoomPresence(userId: string): {
  roomCode: string;
  seat: Seat | null;
  isSpectator: boolean;
  kibitzingAllowed: boolean;
  phase: string;
  occupants: { seat: Seat; displayName: string; isAI: boolean }[];
} | null {
  for (const [code, room] of rooms) {
    const seat = findSeatByUserId(room, userId);
    const isSpectating = !seat && room.spectators.some(s => s.userId === userId);
    if (!seat && !isSpectating) continue;

    const occupants = SEATS
      .filter(s => room.seats[s].userId)
      .map(s => ({ seat: s, displayName: room.seats[s].displayName, isAI: room.seats[s].isAI }));

    return {
      roomCode: code,
      seat: seat ?? null,
      isSpectator: isSpectating,
      kibitzingAllowed: room.kibitzingAllowed,
      phase: room.game?.phase ?? 'waiting',
      occupants,
    };
  }
  return null;
}

export { rooms };
