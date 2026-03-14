import { create } from 'zustand';
import type { GameState, Card, Seat, SeatInfo, SpectatorInfo, Contract } from '@goatbridge/shared';

interface GameStoreState {
  roomCode: string | null;
  isSpectator: boolean;
  hostUserId: string | null;
  yourSeat: Seat | null;
  yourHand: Card[];
  gameState: GameState | null;
  // Pre-game lobby state (populated from room_joined / room_updated)
  roomSeats: Record<Seat, SeatInfo> | null;
  roomKibitzingAllowed: boolean;
  roomSpectators: SpectatorInfo[];
  lastHandResult: { contract: Contract; declarer: Seat; tricksMade: number; contractMade: boolean } | null;
  messages: ChatMessage[];
  goatToast: { amount: number; id: number } | null;

  setRoom: (roomCode: string, hostUserId: string, isSpectator: boolean) => void;
  setYourSeat: (seat: Seat) => void;
  setYourHand: (hand: Card[]) => void;
  setGameState: (state: GameState) => void;
  setRoomLobby: (seats: Record<Seat, SeatInfo>, kibitzingAllowed: boolean, spectators: SpectatorInfo[]) => void;
  setLastHandResult: (result: { contract: Contract; declarer: Seat; tricksMade: number; contractMade: boolean } | null) => void;
  updateSeats: (seats: Record<Seat, SeatInfo>) => void;
  revealDummy: (dummy: Seat, dummyHand: Card[]) => void;
  addMessage: (msg: ChatMessage) => void;
  removeCardFromHand: (card: Card) => void;
  showGoatToast: (amount: number) => void;
  clearGoatToast: () => void;
  reset: () => void;
}

export interface ChatMessage {
  seat: Seat | null;
  displayName: string;
  text: string;
  timestamp: number;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  roomCode: null,
  isSpectator: false,
  hostUserId: null,
  yourSeat: null,
  yourHand: [],
  gameState: null,
  roomSeats: null,
  roomKibitzingAllowed: true,
  roomSpectators: [],
  lastHandResult: null,
  messages: [],
  goatToast: null,

  setRoom: (roomCode, hostUserId, isSpectator) => set({ roomCode, hostUserId, isSpectator }),
  setYourSeat: (seat) => set({ yourSeat: seat }),
  setYourHand: (hand) => set({ yourHand: hand }),
  setGameState: (state) => set({ gameState: state, roomSeats: state.seats, roomKibitzingAllowed: state.kibitzingAllowed, roomSpectators: state.spectators }),
  setRoomLobby: (seats, kibitzingAllowed, spectators) => set({ roomSeats: seats, roomKibitzingAllowed: kibitzingAllowed, roomSpectators: spectators }),
  setLastHandResult: (result) => set({ lastHandResult: result }),
  updateSeats: (seats) => set(s => ({
    roomSeats: seats,
    ...(s.gameState ? { gameState: { ...s.gameState, seats } } : {}),
  })),
  revealDummy: (dummy, dummyHand) =>
    set(s => s.gameState ? { gameState: { ...s.gameState, dummy, dummyHand } } : {}),
  addMessage: (msg) => set(s => ({ messages: [...s.messages.slice(-200), msg] })),
  removeCardFromHand: (card) =>
    set(s => ({
      yourHand: s.yourHand.filter(c => !(c.suit === card.suit && c.rank === card.rank)),
    })),
  showGoatToast: (amount) => set({ goatToast: { amount, id: Date.now() } }),
  clearGoatToast: () => set({ goatToast: null }),
  reset: () => set({
    roomCode: null,
    isSpectator: false,
    hostUserId: null,
    yourSeat: null,
    yourHand: [],
    gameState: null,
    roomSeats: null,
    roomKibitzingAllowed: true,
    roomSpectators: [],
    lastHandResult: null,
    messages: [],
  }),
}));
