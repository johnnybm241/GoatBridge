import { useEffect, useState } from 'react';
import type { GameState, Seat, SpectatorInfo, TableVisibility } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import { getSocket } from '../../socket.js';
import api from '../../api.js';
import { useInvitesStore } from '../../store/invitesStore.js';

interface Friend {
  userId: string;
  username: string;
}

interface HostAdminPanelProps {
  gameState: GameState | null;
  roomCode: string;
  seats: Record<Seat, { userId: string | null; isAI: boolean; displayName: string }>;
  kibitzingAllowed: boolean;
  spectators: SpectatorInfo[];
  visibility: TableVisibility;
}

export default function HostAdminPanel({
  roomCode,
  gameState,
  seats,
  kibitzingAllowed,
  spectators,
  visibility,
}: HostAdminPanelProps) {
  const socket = getSocket();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const joinRequests = useInvitesStore(s => s.joinRequests);
  const dismissJoinRequest = useInvitesStore(s => s.dismissJoinRequest);
  const isGameInProgress = gameState && gameState.phase !== 'waiting' && gameState.phase !== 'complete';

  useEffect(() => {
    api.get<{ friends: Friend[] }>('/friends')
      .then(r => setFriends(r.data.friends ?? []))
      .catch(() => setFriends([]));
  }, []);

  const addBot = (seat: Seat) => socket.emit('add_bot', { roomCode, seat });
  const removeBot = (seat: Seat) => socket.emit('remove_bot', { roomCode, seat });
  const startGame = () => socket.emit('start_game', { roomCode });
  const toggleKibitzing = () => socket.emit('set_kibitzing', { roomCode, allowed: !kibitzingAllowed });
  const kickSpectator = (userId: string) => socket.emit('kick_spectator', { roomCode, userId });
  const kickPlayer = (seat: Seat) => socket.emit('kick_player', { roomCode, seat });

  const setVisibility = (v: TableVisibility) =>
    socket.emit('set_table_visibility', { roomCode, visibility: v });

  const invite = (userId: string) => {
    socket.emit('invite_to_table', { roomCode, userId });
    setInvited(prev => [...prev, userId]);
  };

  const respondJoinRequest = (userId: string, approve: boolean) => {
    socket.emit('respond_join_request', { roomCode, userId, approve });
    dismissJoinRequest(roomCode, userId);
  };

  const seatedUserIds = SEATS.map(s => seats[s].userId).filter(Boolean) as string[];
  const invitableFriends = friends.filter(f => !seatedUserIds.includes(f.userId));

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
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="text-cream/50 truncate max-w-[60px]">{info.displayName}</span>
                      <button
                        onClick={() => kickPlayer(seat)}
                        className="text-red-400 hover:text-red-300 shrink-0"
                        title="Remove from table"
                      >
                        ✕
                      </button>
                    </span>
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

      {/* Table visibility */}
      <div>
        <div className="text-cream/60 text-xs mb-2">Who can join</div>
        <div className="flex gap-1.5">
          {(['public', 'invite_only'] as TableVisibility[]).map(v => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`flex-1 rounded px-2 py-1 text-xs font-bold border transition-colors ${
                visibility === v
                  ? 'bg-gold text-navy border-gold'
                  : 'bg-navy text-cream/60 border-gold/30 hover:border-gold/60'
              }`}
            >
              {v === 'public' ? '🌍 Public' : '🔒 Invite only'}
            </button>
          ))}
        </div>
      </div>

      {/* Join requests */}
      {joinRequests.length > 0 && (
        <div>
          <div className="text-cream/60 text-xs mb-1">Requests to join ({joinRequests.length})</div>
          <div className="space-y-1">
            {joinRequests.map(r => (
              <div key={r.userId} className="flex items-center justify-between text-xs gap-1">
                <span className="text-cream/70 truncate">{r.username}</span>
                <span className="flex gap-1 shrink-0">
                  <button
                    onClick={() => respondJoinRequest(r.userId, true)}
                    className="text-green-400 hover:text-green-300 border border-green-700 rounded px-2 py-0.5"
                  >
                    Allow
                  </button>
                  <button
                    onClick={() => respondJoinRequest(r.userId, false)}
                    className="text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-0.5"
                  >
                    Deny
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite friends */}
      {invitableFriends.length > 0 && (
        <div>
          <div className="text-cream/60 text-xs mb-1">Invite a friend</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {invitableFriends.map(f => (
              <div key={f.userId} className="flex items-center justify-between text-xs gap-1">
                <span className="text-cream/70 truncate">{f.username}</span>
                <button
                  onClick={() => invite(f.userId)}
                  disabled={invited.includes(f.userId)}
                  className="text-gold hover:text-gold-light border border-gold/40 rounded px-2 py-0.5 disabled:opacity-40 shrink-0"
                >
                  {invited.includes(f.userId) ? 'Invited' : 'Invite'}
                </button>
              </div>
            ))}
          </div>
        </div>
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
