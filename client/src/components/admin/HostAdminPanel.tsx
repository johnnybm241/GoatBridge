import type { GameState, Seat, SpectatorInfo } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import { getSocket } from '../../socket.js';

interface HostAdminPanelProps {
  gameState: GameState | null;
  roomCode: string;
  seats: Record<Seat, { userId: string | null; isAI: boolean; displayName: string }>;
  kibitzingAllowed: boolean;
  spectators: SpectatorInfo[];
}

export default function HostAdminPanel({
  roomCode,
  gameState,
  seats,
  kibitzingAllowed,
  spectators,
}: HostAdminPanelProps) {
  const socket = getSocket();
  const isGameInProgress = gameState && gameState.phase !== 'waiting' && gameState.phase !== 'complete';

  const addBot = (seat: Seat) => socket.emit('add_bot', { roomCode, seat });
  const removeBot = (seat: Seat) => socket.emit('remove_bot', { roomCode, seat });
  const startGame = () => socket.emit('start_game', { roomCode });
  const toggleKibitzing = () => socket.emit('set_kibitzing', { roomCode, allowed: !kibitzingAllowed });
  const kickSpectator = (userId: string) => socket.emit('kick_spectator', { roomCode, userId });

  const allSeated = SEATS.every(s => seats[s].userId || seats[s].isAI);

  return (
    <div className="bg-navy/80 border border-gold/30 rounded-xl p-4 space-y-4">
      <div className="text-gold font-bold text-sm">Host Controls</div>

      {/* Bot management */}
      {!isGameInProgress && (
        <div>
          <div className="text-cream/60 text-xs mb-2">Seat Management</div>
          <div className="grid grid-cols-2 gap-2">
            {SEATS.map(seat => {
              const info = seats[seat];
              const isEmpty = !info.userId && !info.isAI;
              return (
                <div key={seat} className="flex items-center justify-between text-xs">
                  <span className="text-cream/70 capitalize">{seat}</span>
                  {isEmpty ? (
                    <button
                      onClick={() => addBot(seat)}
                      className="text-green-400 hover:text-green-300 border border-green-700 rounded px-2 py-0.5"
                    >
                      + Bot
                    </button>
                  ) : info.isAI ? (
                    <button
                      onClick={() => removeBot(seat)}
                      className="text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-0.5"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-cream/50 truncate max-w-[70px]">{info.displayName}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Start game */}
      {!isGameInProgress && (
        <button
          onClick={startGame}
          disabled={!allSeated}
          className="w-full bg-gold hover:bg-gold-light text-navy font-bold py-2 rounded-lg text-sm disabled:opacity-40 transition-colors"
        >
          {allSeated ? 'Start Game' : 'Fill all seats first'}
        </button>
      )}

      {/* Kibitzing toggle */}
      <div className="flex items-center justify-between">
        <span className="text-cream/70 text-sm">Allow Spectators</span>
        <button
          onClick={toggleKibitzing}
          className={`w-10 h-5 rounded-full transition-colors relative ${kibitzingAllowed ? 'bg-green-600' : 'bg-gray-600'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${kibitzingAllowed ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Spectator list */}
      {kibitzingAllowed && spectators.length > 0 && (
        <div>
          <div className="text-cream/60 text-xs mb-1">Spectators ({spectators.length})</div>
          <div className="space-y-1">
            {spectators.map(s => (
              <div key={s.userId} className="flex items-center justify-between text-xs">
                <span className="text-cream/70">{s.displayName}</span>
                <button
                  onClick={() => kickSpectator(s.userId)}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  Kick
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
