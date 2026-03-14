import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../auth/service.js';
import { setupRoomHandlers } from './roomHandlers.js';
import { setupGameHandlers, handleAIBid, handleAIPlay } from './gameHandlers.js';
import type { Seat } from '@goatbridge/shared';
import type { BidCall } from '@goatbridge/shared';
import type { Card } from '@goatbridge/shared';
import type { GameRoom } from '../game/stateMachine.js';

// In development allow any localhost port (Vite may pick 5174, 5175, etc.)
// In production restrict to the explicit CLIENT_ORIGIN
const corsOrigin = config.nodeEnv === 'production'
  ? config.clientOrigin
  : /^http:\/\/localhost(:\d+)?$/;

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const typedSocket = socket as typeof socket & { data: { userId: string; username: string } };

    // AI action callbacks wired to gameHandlers
    const aiBid = (_room: GameRoom, seat: Seat, call: BidCall) =>
      handleAIBid(io, _room.roomCode, seat, call);
    const aiPlay = (_room: GameRoom, seat: Seat, card: Card) =>
      handleAIPlay(io, _room.roomCode, seat, card);

    setupRoomHandlers(io, typedSocket, aiBid, aiPlay);
    setupGameHandlers(io, typedSocket);
  });

  return io;
}
