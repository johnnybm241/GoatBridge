import type { Seat, SeatInfo, SpectatorInfo } from './game.js';

export type RoomStatus = 'waiting' | 'playing' | 'complete';

export interface Room {
  id: string;
  roomCode: string;
  createdBy: string;
  status: RoomStatus;
  seats: Record<Seat, SeatInfo>;
  kibitzingAllowed: boolean;
  spectators: SpectatorInfo[];
}
