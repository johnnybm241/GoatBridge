import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';

export function useGameState() {
  const store = useGameStore();
  const auth = useAuthStore();

  const isYourTurn = () => {
    const gs = store.gameState;
    if (!gs || !store.yourSeat) return false;

    if (gs.phase === 'playing' && gs.currentTurn === gs.dummy) {
      // Declarer plays dummy's cards — but only if the declarer is the human user
      if (store.yourSeat === gs.declarer) {
        // Only allow if declarer is not an AI (i.e. the user is the human declarer)
        return !gs.seats[gs.declarer]?.isAI;
      }
      // User is dummy but partner (AI) is declarer — AI plays dummy, user does nothing
      if (store.yourSeat === gs.dummy) return false;
    }

    return gs.currentTurn === store.yourSeat;
  };

  return {
    ...store,
    isYourTurn,
    isHost: store.hostUserId === auth.userId,
  };
}
