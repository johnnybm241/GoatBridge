import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@goatbridge/shared';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    throw new Error('Socket not initialized. Call initSocket first.');
  }
  return socket;
}

export function initSocket(token: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket) {
    socket.disconnect();
  }

  socket = io('http://localhost:3001', {
    auth: { token },
    autoConnect: true,
  }) as unknown as Socket<ServerToClientEvents, ClientToServerEvents>;

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
