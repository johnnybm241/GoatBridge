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
