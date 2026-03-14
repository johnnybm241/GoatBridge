import { useEffect, useRef } from 'react';
import { getSocket } from '../socket.js';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import type { Seat, SeatInfo } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

export function useSocketEvents() {
  const store = useGameStore();
  const authStore = useAuthStore();
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    socket.on('room_joined', (payload) => {
      store.setRoom(payload.roomCode, payload.hostUserId, payload.isSpectator);
      if (payload.seats) {
        const yourUserId = authStore.userId;
        for (const s of SEATS) {
          if (payload.seats[s]?.userId === yourUserId) {
            store.setYourSeat(s);
            break;
          }
        }
      }
    });

    socket.on('room_updated', (payload) => {
      if (store.gameState) {
        store.setGameState({ ...store.gameState, seats: payload.seats as Record<Seat, SeatInfo>, kibitzingAllowed: payload.kibitzingAllowed, spectators: payload.spectators });
      }
    });

    socket.on('game_started', (payload) => {
      store.setGameState(payload.gameState);
      store.setYourHand(payload.yourHand);
    });

    socket.on('bid_made', (payload) => {
      const gs = store.gameState;
      if (!gs) return;
      store.setGameState({ ...gs, bidding: payload.bidding, currentTurn: gs.currentTurn });
    });

    socket.on('auction_complete', (payload) => {
      const gs = store.gameState;
      if (!gs) return;
      store.setGameState({
        ...gs,
        phase: payload.passedOut ? 'bidding' : 'playing',
        contract: payload.contract,
        declarer: payload.declarer,
        dummy: payload.dummy,
        currentTurn: payload.passedOut ? gs.dealer : gs.currentTurn,
      });
    });

    socket.on('dummy_revealed', (payload) => {
      store.revealDummy(payload.dummy, payload.dummyHand);
    });

    socket.on('card_played', (payload) => {
      const gs = store.gameState;
      if (!gs) return;
      store.setGameState({ ...gs, currentTrick: payload.currentTrick });
      // Remove from hand if it was our card
      const seat = store.yourSeat;
      if (payload.seat === seat || (gs.declarer === seat && payload.seat === gs.dummy)) {
        store.removeCardFromHand(payload.card);
      }
    });

    socket.on('trick_complete', (payload) => {
      const gs = store.gameState;
      if (!gs) return;
      store.setGameState({
        ...gs,
        completedTricks: [...gs.completedTricks, payload.trick],
        trickCounts: payload.trickCounts,
        currentTrick: { cards: [], leader: payload.nextLead, winner: null },
        currentTurn: payload.nextLead,
      });
    });

    socket.on('hand_complete', (_payload) => {
      const gs = store.gameState;
      if (!gs) return;
      store.setGameState({ ...gs, phase: 'scoring' });
    });

    socket.on('score_update', (payload) => {
      const gs = store.gameState;
      if (!gs) return;
      store.setGameState({ ...gs, scores: payload.scores });
    });

    socket.on('rubber_complete', (payload) => {
      const gs = store.gameState;
      if (!gs) return;
      store.setGameState({ ...gs, scores: payload.scores, phase: 'complete' });
      // Award goats for rubber win
      const seat = store.yourSeat;
      if (!seat) return;
      const side: 'ns' | 'ew' = (seat === 'north' || seat === 'south') ? 'ns' : 'ew';
      if (side === payload.winner) {
        store.showGoatToast(25);
        authStore.setGoatBalance(authStore.goatBalance + 25);
      }
    });

    socket.on('chat_message', (payload) => {
      store.addMessage(payload);
    });

    return () => {
      registered.current = false;
    };
  }, []);
}
