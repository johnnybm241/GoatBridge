import { useEffect, useRef } from 'react';
import { getSocket, initSocket } from '../socket.js';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useTeamMatchStore } from '../store/teamMatchStore.js';
import { useTournamentStore } from '../store/tournamentStore.js';
import type { Seat, SeatInfo } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

export function useSocketEvents() {
  const authStore = useAuthStore();
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      if (!authStore.token) { registered.current = false; return; }
      socket = initSocket(authStore.token);
    }

    // Always read current state via getState() — avoids stale closure bugs
    const store = () => useGameStore.getState();

    socket.on('room_joined', (payload) => {
      store().setRoom(payload.roomCode, payload.hostUserId, payload.isSpectator);
      store().setRoomLobby(payload.seats, payload.kibitzingAllowed, payload.spectators);
      if (payload.seats) {
        const yourUserId = authStore.userId;
        for (const s of SEATS) {
          if (payload.seats[s]?.userId === yourUserId) {
            store().setYourSeat(s);
            break;
          }
        }
      }
    });

    socket.on('room_updated', (payload) => {
      store().setRoomLobby(payload.seats as Record<Seat, SeatInfo>, payload.kibitzingAllowed, payload.spectators);
      const gs = store().gameState;
      if (gs) {
        store().setGameState({ ...gs, seats: payload.seats as Record<Seat, SeatInfo>, kibitzingAllowed: payload.kibitzingAllowed, spectators: payload.spectators });
      }
    });

    socket.on('game_started', (payload) => {
      store().setGameState(payload.gameState);
      store().setYourHand(payload.yourHand);
      store().setLastHandResult(null);
    });

    socket.on('bid_made', (payload) => {
      const gs = store().gameState;
      if (!gs) return;
      store().setGameState({ ...gs, bidding: payload.bidding, currentTurn: payload.currentTurn });
    });

    socket.on('auction_complete', (payload) => {
      const gs = store().gameState;
      if (!gs) return;
      store().setGameState({
        ...gs,
        phase: payload.passedOut ? 'bidding' : 'playing',
        contract: payload.contract,
        declarer: payload.declarer,
        dummy: payload.dummy,
        currentTurn: payload.passedOut ? gs.dealer : gs.currentTurn,
      });
    });

    socket.on('dummy_revealed', (payload) => {
      store().revealDummy(payload.dummy, payload.dummyHand);
    });

    socket.on('card_played', (payload) => {
      const gs = store().gameState;
      if (!gs) return;
      // Always try to remove the played card from dummyHand — cards are unique across all hands,
      // so if it's not dummy's card the filter is a no-op. This covers both human declarer
      // and AI declarer playing dummy's cards (where payload.seat = declarer, not dummy).
      const newDummyHand = gs.dummyHand
        ? gs.dummyHand.filter(c => !(c.suit === payload.card.suit && c.rank === payload.card.rank))
        : gs.dummyHand;
      store().setGameState({ ...gs, currentTrick: payload.currentTrick, currentTurn: payload.currentTurn, dummyHand: newDummyHand });
      const seat = store().yourSeat;
      if (payload.seat === seat || (gs.declarer === seat && payload.seat === gs.dummy)) {
        store().removeCardFromHand(payload.card);
      }
    });

    socket.on('trick_complete', (payload) => {
      const gs = store().gameState;
      if (!gs) return;
      const completedCount = gs.completedTricks.length + 1; // after adding this trick
      // Show the completed trick (with winner) briefly so the sweep animation plays
      store().setGameState({
        ...gs,
        completedTricks: [...gs.completedTricks, payload.trick],
        trickCounts: payload.trickCounts,
        currentTrick: payload.trick,   // keep all 4 cards visible with winner set
        currentTurn: payload.nextLead,
      });
      // Clear the trick after 700ms — but skip if an undo has already rolled back state
      setTimeout(() => {
        const cur = store().gameState;
        if (!cur) return;
        // If completedTricks count no longer matches, an undo happened — don't overwrite
        if (cur.completedTricks.length !== completedCount) return;
        store().setGameState({
          ...cur,
          currentTrick: { cards: [], leader: payload.nextLead, winner: null },
        });
      }, 700);
    });

    socket.on('hand_complete', (payload) => {
      const gs = store().gameState;
      if (!gs) return;
      store().setGameState({ ...gs, phase: 'scoring' });
      store().setLastHandResult({
        contract: payload.contract,
        declarer: payload.declarer,
        tricksMade: payload.tricksMade,
        contractMade: payload.handScore.contractMade,
      });
    });

    socket.on('score_update', (payload) => {
      const gs = store().gameState;
      if (!gs) return;
      store().setGameState({ ...gs, scores: payload.scores });
    });

    socket.on('rubber_complete', (payload) => {
      const gs = store().gameState;
      if (!gs) return;
      store().setGameState({ ...gs, scores: payload.scores, phase: 'complete' });
      const seat = store().yourSeat;
      if (!seat) return;
      const side: 'ns' | 'ew' = (seat === 'north' || seat === 'south') ? 'ns' : 'ew';
      if (side === payload.winner) {
        store().showGoatToast(25);
        useAuthStore.getState().setGoatBalance(useAuthStore.getState().goatBalance + 25);
      }
    });

    socket.on('skill_points_awarded', (payload: { amount: number; skillPoints: number; handsPlayed: number }) => {
      useAuthStore.getState().setSkillPoints(payload.skillPoints);
      useAuthStore.getState().setHandsPlayed(payload.handsPlayed);
    });

    socket.on('bleats_awarded', (payload: { amount: number; bleats: number; handsPlayed: number; reason: string }) => {
      useAuthStore.getState().setBleats(payload.bleats);
      useAuthStore.getState().setHandsPlayed(payload.handsPlayed);
      if (payload.amount > 0) {
        store().showBleatsToast(payload.amount, payload.reason);
      }
    });

    socket.on('undo_requested', (payload: { fromSeat: Seat }) => {
      store().setUndoFromSeat(payload.fromSeat);
    });

    socket.on('undo_result', (payload: { approved: boolean; gameState?: import('@goatbridge/shared').GameState }) => {
      store().setUndoFromSeat(null);
      if (payload.approved && payload.gameState) {
        store().setGameState(payload.gameState);
        // Re-deal hands are sent via separate game_started events to each player
      }
    });

    socket.on('claim_requested', (payload: { fromSeat: Seat }) => {
      store().setClaimFromSeat(payload.fromSeat);
    });

    socket.on('claim_result', (payload: { accepted: boolean; gameState?: import('@goatbridge/shared').GameState }) => {
      store().setClaimFromSeat(null);
      if (payload.accepted && payload.gameState) {
        store().setGameState(payload.gameState);
      }
    });

    socket.on('invalid_card', (payload: { message: string }) => {
      store().setInvalidCardMessage(payload.message);
      setTimeout(() => store().setInvalidCardMessage(null), 2000);
    });

    socket.on('chat_message', (payload) => {
      store().addMessage(payload);
    });

    socket.on('team_match_state', (payload) => {
      useTeamMatchStore.getState().setMatch(payload.match);
    });

    socket.on('team_match_updated', (payload) => {
      useTeamMatchStore.getState().setMatch(payload.match);
    });

    socket.on('team_match_board_result', (payload) => {
      useTeamMatchStore.getState().updateBoardResult(payload);
    });

    socket.on('team_match_complete', (_payload) => {
      // The bleats_awarded event handles the notification.
      // Just mark the match as complete in the store.
      const match = useTeamMatchStore.getState().currentMatch;
      if (match) {
        useTeamMatchStore.getState().setMatch({ ...match, status: 'complete' });
      }
    });

    socket.on('tournament_state', (payload) => {
      useTournamentStore.getState().setTournament(payload.tournament);
    });

    socket.on('tournament_updated', (payload) => {
      useTournamentStore.getState().setTournament(payload.tournament);
    });

    socket.on('tournament_complete', (_payload) => {
      // tournament_updated already carries the completed state
    });

    return () => {
      registered.current = false;
      socket.off('room_joined');
      socket.off('room_updated');
      socket.off('game_started');
      socket.off('bid_made');
      socket.off('auction_complete');
      socket.off('dummy_revealed');
      socket.off('card_played');
      socket.off('trick_complete');
      socket.off('hand_complete');
      socket.off('score_update');
      socket.off('rubber_complete');
      socket.off('skill_points_awarded');
      socket.off('bleats_awarded');
      socket.off('undo_requested');
      socket.off('undo_result');
      socket.off('claim_requested');
      socket.off('claim_result');
      socket.off('invalid_card');
      socket.off('chat_message');
      socket.off('team_match_state');
      socket.off('team_match_updated');
      socket.off('team_match_board_result');
      socket.off('team_match_complete');
      socket.off('tournament_state');
      socket.off('tournament_updated');
      socket.off('tournament_complete');
    };
  }, []);
}
