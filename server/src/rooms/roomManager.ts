import type { Seat, SeatInfo } from '@goatbridge/shared';
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
  };
}

export function createRoom(hostUserId: string): GameRoom {
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
    previousState: null,
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
  // Check already seated
  const existingSeat = findSeatByUserId(room, userId);
  if (existingSeat) {
    room.seats[existingSeat].isConnected = true;
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

export { rooms };
