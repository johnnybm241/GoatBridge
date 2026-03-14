import type { BidCall } from '../types/bidding.js';
import type { Card } from '../types/card.js';
import type { Seat } from '../types/game.js';

export interface JoinRoomPayload {
  roomCode: string;
  spectate?: boolean;
}

export interface LeaveRoomPayload {
  roomCode: string;
}

export interface AddBotPayload {
  roomCode: string;
  seat: Seat;
}

export interface RemoveBotPayload {
  roomCode: string;
  seat: Seat;
}

export interface StartGamePayload {
  roomCode: string;
}

export interface MakeBidPayload {
  roomCode: string;
  call: BidCall;
}

export interface PlayCardPayload {
  roomCode: string;
  card: Card;
}

export interface RequestUndoPayload {
  roomCode: string;
}

export interface RespondUndoPayload {
  roomCode: string;
  approve: boolean;
}

export interface ChatMessagePayload {
  roomCode: string;
  text: string;
}

export interface SetKibitzingPayload {
  roomCode: string;
  allowed: boolean;
}

export interface KickSpectatorPayload {
  roomCode: string;
  userId: string;
}

export interface ApprovePlayerReturnPayload {
  roomCode: string;
  seat: Seat;
}

export interface DenyPlayerReturnPayload {
  roomCode: string;
  seat: Seat;
}

export interface ShareConventionCardPayload {
  roomCode: string;
  conventionCardId: string;
}

export interface ClientToServerEvents {
  create_room: () => void;
  join_room: (payload: JoinRoomPayload) => void;
  leave_room: (payload: LeaveRoomPayload) => void;
  add_bot: (payload: AddBotPayload) => void;
  remove_bot: (payload: RemoveBotPayload) => void;
  start_game: (payload: StartGamePayload) => void;
  make_bid: (payload: MakeBidPayload) => void;
  play_card: (payload: PlayCardPayload) => void;
  request_undo: (payload: RequestUndoPayload) => void;
  respond_undo: (payload: RespondUndoPayload) => void;
  chat_message: (payload: ChatMessagePayload) => void;
  set_kibitzing: (payload: SetKibitzingPayload) => void;
  kick_spectator: (payload: KickSpectatorPayload) => void;
  approve_player_return: (payload: ApprovePlayerReturnPayload) => void;
  deny_player_return: (payload: DenyPlayerReturnPayload) => void;
  share_convention_card: (payload: ShareConventionCardPayload) => void;
}
