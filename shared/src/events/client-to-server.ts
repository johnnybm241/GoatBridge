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

export interface RequestClaimPayload {
  roomCode: string;
}

export interface RespondClaimPayload {
  roomCode: string;
  accept: boolean;
}

export interface CreateTeamMatchPayload {
  name: string;
  boardCount: 4 | 8 | 12 | 16;
}

export interface JoinTeamMatchPayload {
  matchCode: string;
}

export interface JoinTeamPayload {
  matchCode: string;
  team: 1 | 2;
}

export interface LeaveTeamMatchPayload {
  matchCode: string;
}

export interface StartTeamMatchPayload {
  matchCode: string;
}

export interface CreateTournamentPayload {
  name: string;
  totalBoards: number;
  boardsPerRound: number;
}

export interface JoinTournamentPayload {
  tournamentCode: string;
}

export interface JoinTournamentLobbyPayload {
  tournamentCode: string;
}

export interface LeaveTournamentLobbyPayload {
  tournamentCode: string;
}

export interface StartTournamentPayload {
  tournamentCode: string;
}

export interface AddPairEntryPayload {
  tournamentCode: string;
  player1UserId: string;
  player1DisplayName: string;
  player2UserId?: string;
  player2DisplayName?: string;
}

export interface RemovePairEntryPayload {
  tournamentCode: string;
  pairId: string;
}

export interface SelfJoinTournamentPayload {
  tournamentCode: string;
  partnerUserId?: string;
  partnerDisplayName?: string;
}

export interface LeaveTournamentPairPayload {
  tournamentCode: string;
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
  request_claim: (payload: RequestClaimPayload) => void;
  respond_claim: (payload: RespondClaimPayload) => void;
  create_team_match: (payload: CreateTeamMatchPayload) => void;
  join_team_match: (payload: JoinTeamMatchPayload) => void;
  join_team: (payload: JoinTeamPayload) => void;
  leave_team_match: (payload: LeaveTeamMatchPayload) => void;
  start_team_match: (payload: StartTeamMatchPayload) => void;
  create_tournament: (payload: CreateTournamentPayload) => void;
  join_tournament_lobby: (payload: JoinTournamentLobbyPayload) => void;
  leave_tournament_lobby: (payload: LeaveTournamentLobbyPayload) => void;
  start_tournament: (payload: StartTournamentPayload) => void;
  join_tournament: (payload: JoinTournamentPayload) => void;
  add_pair_entry: (payload: AddPairEntryPayload) => void;
  remove_pair_entry: (payload: RemovePairEntryPayload) => void;
  join_tournament: (payload: SelfJoinTournamentPayload) => void;
  leave_tournament_pair: (payload: LeaveTournamentPairPayload) => void;
}
