import type { Server, Socket } from 'socket.io';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

// Map userId -> socketId
const userSockets = new Map<string, string>();

export function registerSocket(userId: string, socketId: string): void {
  userSockets.set(userId, socketId);
}

export function unregisterSocket(userId: string): void {
  userSockets.delete(userId);
}

export function getSocketId(userId: string): string | undefined {
  return userSockets.get(userId);
}

export function emitToUser<T>(io: Server, userId: string, event: string, data: T): void {
  const socketId = userSockets.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
  }
}

export function emitToRoom<T>(io: Server, roomCode: string, event: string, data: T): void {
  io.to(roomCode).emit(event, data);
}

export function emitToRoomExcept<T>(io: Server, roomCode: string, excludeSocketId: string, event: string, data: T): void {
  io.to(roomCode).except(excludeSocketId).emit(event, data);
}

interface GameStartedRoom {
  roomCode: string;
  spectators: Array<{ userId: string; displayName: string }>;
}

/**
 * Emit `game_started` for a freshly dealt hand.
 *
 * Seated humans each receive only their own 13 cards. Spectators receive all
 * four hands, since kibitzers are allowed to see everything. Every deal must go
 * through this helper so spectators never miss a board transition.
 */
export function emitGameStarted(
  io: Server,
  room: GameStartedRoom,
  game: { seats: Record<Seat, { isAI: boolean; userId?: string | null }> },
  hands: Record<Seat, unknown[]>,
): void {
  for (const seat of SEATS) {
    const info = game.seats[seat];
    if (!info.isAI && info.userId) {
      const socketId = getSocketId(info.userId);
      if (socketId) io.to(socketId).emit('game_started', { gameState: game, yourHand: hands[seat] });
    }
  }
  for (const spectator of room.spectators) {
    const socketId = getSocketId(spectator.userId);
    if (socketId) io.to(socketId).emit('game_started', { gameState: game, yourHand: [], allHands: hands });
  }
}
