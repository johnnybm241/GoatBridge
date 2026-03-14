import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';

export function useGameState() {
  const store = useGameStore();
  const auth = useAuthStore();

  const isYourTurn = () => {
    const gs = store.gameState;
    if (!gs || !store.yourSeat) return false;
    // Declarer plays dummy too
    if (gs.phase === 'playing' && gs.currentTurn === gs.dummy && store.yourSeat === gs.declarer) {
      return true;
    }
    return gs.currentTurn === store.yourSeat;
  };

  return {
    ...store,
    isYourTurn,
    isHost: store.hostUserId === auth.userId,
  };
}
