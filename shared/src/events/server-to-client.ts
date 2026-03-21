import type { Card } from '../types/card.js';
import type { BidCall, BiddingState } from '../types/bidding.js';
import type { GameState, Seat, SeatInfo, SpectatorInfo, Trick } from '../types/game.js';
import type { Contract, HandScore, RubberScore } from '../types/scoring.js';
import type { ConventionCardData } from '../types/conventions.js';
import type { TeamMatchState } from '../types/teamMatch.js';
import type { TournamentState, PairEntry } from '../types/tournament.js';

export interface RoomJoinedPayload {
  roomCode: string;
  seats: Record<Seat, SeatInfo>;
  kibitzingAllowed: boolean;
  spectators: SpectatorInfo[];
  hostUserId: string;
  isSpectator: boolean;
}

export interface RoomUpdatedPayload {
  seats: Record<Seat, SeatInfo>;
  status: string;
  kibitzingAllowed: boolean;
  spectators: SpectatorInfo[];
}

export interface GameStartedPayload {
  gameState: GameState;
  yourHand: Card[]; // only your cards (empty for spectators)
}

export interface DealCompletePayload {
  dealer: Seat;
}

export interface BidMadePayload {
  seat: Seat;
  call: BidCall;
  bidding: BiddingState;
  currentTurn: Seat;
}

export interface AuctionCompletePayload {
  contract: Contract | null;
  declarer: Seat | null;
  dummy: Seat | null;
  passedOut: boolean;
}

export interface DummyRevealedPayload {
  dummy: Seat;
  dummyHand: Card[];
}

export interface CardPlayedPayload {
  seat: Seat;
  card: Card;
  currentTrick: Trick;
  currentTurn: Seat | null;
}

export interface TrickCompletePayload {
  trick: Trick;
  winner: Seat;
  trickCounts: Record<'ns' | 'ew', number>;
  nextLead: Seat;
}

export interface HandCompletePayload {
  handScore: HandScore;
  tricksMade: number;
  contract: Contract;
  declarer: Seat;
}

export interface ScoreUpdatePayload {
  scores: RubberScore;
  vulnerability: string;
}

export interface RubberCompletePayload {
  scores: RubberScore;
  winner: 'ns' | 'ew';
}

export interface PlayerJoinedPayload {
  seat: Seat;
  seatInfo: SeatInfo;
}

export interface PlayerLeftPayload {
  seat: Seat;
}

export interface PlayerDisconnectedPayload {
  seat: Seat;
  secondsRemaining: number;
}

export interface PlayerReconnectedPayload {
  seat: Seat;
}

export interface BotReplacingPlayerPayload {
  seat: Seat;
}

export interface PlayerReturnRequestPayload {
  seat: Seat;
  displayName: string;
}

export interface PlayerReturnedPayload {
  seat: Seat;
  yourHand?: Card[]; // only sent to the returning player
}

export interface UndoRequestedPayload {
  fromSeat: Seat;
}

export interface UndoResultPayload {
  approved: boolean;
  gameState?: GameState; // sent if approved
}

export interface ChatMessageBroadcastPayload {
  seat: Seat | null;
  displayName: string;
  text: string;
  timestamp: number;
}

export interface SpectatorJoinedPayload {
  spectator: SpectatorInfo;
}

export interface SpectatorLeftPayload {
  userId: string;
}

export interface KibitzingChangedPayload {
  allowed: boolean;
}

export interface ConventionCardsShownPayload {
  partnership: 'ns' | 'ew';
  card: ConventionCardData;
  cardName: string;
}

export interface ClaimRequestedPayload {
  fromSeat: Seat;
}

export interface ClaimResultPayload {
  accepted: boolean;
  gameState?: GameState; // sent when accepted (shows final state)
}

export interface BleatsAwardedPayload {
  amount: number;    // bleats earned this hand
  bleats: number;    // new running total
  handsPlayed: number;
  reason: string;    // e.g. "Hand played", "Contract made!", "Defenders win!", "Rubber won!"
}

export interface RoomErrorPayload {
  message: string;
}

export interface TeamMatchStatePayload {
  match: TeamMatchState;
}

export interface TeamMatchBoardResultPayload {
  matchCode: string;
  boardNumber: number;
  t1NsSigned: number | null;
  t2NsSigned: number | null;
  impsTeam1: number | null;
  totalImpsTeam1: number;
  totalImpsTeam2: number;
}

export interface TeamMatchStartedPayload {
  matchCode: string;
  yourRoomCode: string;
  table1RoomCode: string;
  table2RoomCode: string;
}

export interface TeamMatchCompletePayload {
  matchCode: string;
  team1Imps: number;
  team2Imps: number;
  team1Name: string;
  team2Name: string;
  winner: 'team1' | 'team2' | 'tie';
}

export interface TournamentStatePayload {
  tournament: TournamentState;
  pairEntries?: PairEntry[];
}

export interface TournamentCompletePayload {
  tournamentCode: string;
}

export interface PairsTableStartedPayload {
  tournamentCode: string;
  yourRoomCode: string;
  roundNumber: number;
  boardStart: number;
  boardEnd: number;
}

export interface HandSwappedPayload {
  yourHand: Card[];
  gameState: GameState;
}

export interface TournamentErrorPayload {
  message: string;
}

export interface ServerToClientEvents {
  room_joined: (payload: RoomJoinedPayload) => void;
  room_updated: (payload: RoomUpdatedPayload) => void;
  player_joined: (payload: PlayerJoinedPayload) => void;
  player_left: (payload: PlayerLeftPayload) => void;
  player_disconnected: (payload: PlayerDisconnectedPayload) => void;
  player_reconnected: (payload: PlayerReconnectedPayload) => void;
  bot_replacing_player: (payload: BotReplacingPlayerPayload) => void;
  player_return_request: (payload: PlayerReturnRequestPayload) => void;
  player_returned: (payload: PlayerReturnedPayload) => void;
  game_started: (payload: GameStartedPayload) => void;
  deal_complete: (payload: DealCompletePayload) => void;
  bid_made: (payload: BidMadePayload) => void;
  auction_complete: (payload: AuctionCompletePayload) => void;
  dummy_revealed: (payload: DummyRevealedPayload) => void;
  card_played: (payload: CardPlayedPayload) => void;
  trick_complete: (payload: TrickCompletePayload) => void;
  hand_complete: (payload: HandCompletePayload) => void;
  score_update: (payload: ScoreUpdatePayload) => void;
  rubber_complete: (payload: RubberCompletePayload) => void;
  invalid_bid: (payload: RoomErrorPayload) => void;
  invalid_card: (payload: RoomErrorPayload) => void;
  auth_error: (payload: RoomErrorPayload) => void;
  room_error: (payload: RoomErrorPayload) => void;
  undo_requested: (payload: UndoRequestedPayload) => void;
  undo_result: (payload: UndoResultPayload) => void;
  chat_message: (payload: ChatMessageBroadcastPayload) => void;
  spectator_joined: (payload: SpectatorJoinedPayload) => void;
  spectator_left: (payload: SpectatorLeftPayload) => void;
  kibitzing_changed: (payload: KibitzingChangedPayload) => void;
  kicked: () => void;
  convention_cards_shown: (payload: ConventionCardsShownPayload) => void;
  claim_requested: (payload: ClaimRequestedPayload) => void;
  claim_result: (payload: ClaimResultPayload) => void;
  bleats_awarded: (payload: BleatsAwardedPayload) => void;
  team_match_state: (payload: TeamMatchStatePayload) => void;
  team_match_updated: (payload: TeamMatchStatePayload) => void;
  team_match_started: (payload: TeamMatchStartedPayload) => void;
  team_match_board_result: (payload: TeamMatchBoardResultPayload) => void;
  team_match_complete: (payload: TeamMatchCompletePayload) => void;
  tournament_state: (payload: TournamentStatePayload) => void;
  tournament_updated: (payload: TournamentStatePayload) => void;
  tournament_complete: (payload: TournamentCompletePayload) => void;
  tournament_joined: (payload: TournamentStatePayload) => void;
  pairs_table_started: (payload: PairsTableStartedPayload) => void;
  hand_swapped: (payload: HandSwappedPayload) => void;
  tournament_error: (payload: TournamentErrorPayload) => void;
}
