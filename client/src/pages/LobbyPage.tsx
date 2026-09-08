import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, initSocket } from '../socket.js';
import { useAuthStore } from '../store/authStore.js';
import { useGameStore } from '../store/gameStore.js';
import { useInvitesStore } from '../store/invitesStore.js';
import { APP_VERSION } from '../version.js';
import api from '../api.js';
import type { Seat, SeatInfo, SpectatorInfo, TableSummary, TableVisibility, RoomJoinedPayload } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

interface ActiveRoom {
  roomCode: string;
  seat: string;
  phase: string;
  handNumber: number;
}

export default function LobbyPage() {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [newTableVisibility, setNewTableVisibility] = useState<TableVisibility>('public');
  const navigate = useNavigate();
  const auth = useAuthStore();
  const gameStore = useGameStore();
  const invites = useInvitesStore();
  const roomJoinedHandlerRef = useRef<((payload: RoomJoinedPayload) => void) | null>(null);
  const roomErrorHandlerRef = useRef<((payload: { message: string }) => void) | null>(null);
  const roomRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ensure socket is connected whenever we land on the lobby
  useEffect(() => {
    if (!auth.token) return;
    try {
      const s = getSocket();
      // Reconnect if disconnected
      if (!s.connected) s.connect();
    } catch {
      initSocket(auth.token);
    }
  }, [auth.token]);

  // Fetch rooms the user is currently seated in
  useEffect(() => {
    api.get<{ rooms: ActiveRoom[] }>('/rooms/active')
      .then(r => setActiveRooms(r.data.rooms))
      .catch(() => {});
  }, []);

  const loadTables = useCallback(() => {
    api.get<{ tables: TableSummary[] }>('/rooms/browse')
      .then(r => setTables(r.data.tables ?? []))
      .catch(() => setTables([]));
  }, []);

  // Poll the table list so newly opened tables show up without a manual refresh
  useEffect(() => {
    loadTables();
    const id = setInterval(loadTables, 5000);
    return () => clearInterval(id);
  }, [loadTables]);

  const clearRoomRequestHandlers = (socket: ReturnType<typeof getSocket>) => {
    if (roomJoinedHandlerRef.current) {
      socket.off('room_joined', roomJoinedHandlerRef.current);
      roomJoinedHandlerRef.current = null;
    }
    if (roomErrorHandlerRef.current) {
      socket.off('room_error', roomErrorHandlerRef.current);
      roomErrorHandlerRef.current = null;
    }
    if (roomRequestTimeoutRef.current) {
      clearTimeout(roomRequestTimeoutRef.current);
      roomRequestTimeoutRef.current = null;
    }
  };

  const setupRoomRequestHandlers = (socket: ReturnType<typeof getSocket>) => {
    clearRoomRequestHandlers(socket);
    const onJoined = (payload: RoomJoinedPayload) => {
      clearRoomRequestHandlers(socket);
      setSubmitting(false);
      gameStore.setRoom(payload.roomCode, payload.hostUserId, payload.isSpectator);
      gameStore.setRoomVisibility(payload.visibility ?? 'public');
      gameStore.setRoomLobby(payload.seats, payload.kibitzingAllowed, payload.spectators);
      for (const s of SEATS) {
        if (payload.seats[s]?.userId === auth.userId) { gameStore.setYourSeat(s); break; }
      }
      navigate(`/game/${payload.roomCode}`);
    };
    const onError = (payload: { message: string }) => {
      clearRoomRequestHandlers(socket);
      setSubmitting(false);
      setError(payload.message);
    };
    roomJoinedHandlerRef.current = onJoined;
    roomErrorHandlerRef.current = onError;
    socket.on('room_joined', onJoined);
    socket.on('room_error', onError);
    roomRequestTimeoutRef.current = setTimeout(() => {
      clearRoomRequestHandlers(socket);
      setSubmitting(false);
      setError('Unable to open table right now. Please try again.');
    }, 8000);
  };

  const ensureSocket = (): ReturnType<typeof getSocket> => {
    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      socket = initSocket(auth.token!);
    }
    if (!socket.connected) socket.connect();
    return socket;
  };

  useEffect(() => {
    return () => {
      try {
        const socket = getSocket();
        clearRoomRequestHandlers(socket);
      } catch {
        // No socket initialized; nothing to clean up.
      }
    };
  }, []);

  const createRoom = () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const socket = ensureSocket();
    setupRoomRequestHandlers(socket);
    socket.emit('create_room', { visibility: newTableVisibility });
  };

  const joinTable = (code: string, spectate: boolean) => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const socket = ensureSocket();
    setupRoomRequestHandlers(socket);
    socket.emit('join_room', { roomCode: code.toUpperCase(), spectate });
  };

  const askToJoin = (code: string) => {
    const socket = ensureSocket();
    socket.emit('request_join_table', { roomCode: code });
    setError(`Asked the host to join ${code}. You'll be able to join once they approve.`);
  };

  const acceptInvite = (code: string) => {
    invites.dismissInvite(code);
    joinTable(code, false);
  };

  const rejoinRoom = (code: string) => joinTable(code, false);

  const phaseLabel = (phase: string, handNumber: number) => {
    if (phase === 'waiting') return 'Waiting';
    if (phase === 'scoring' || phase === 'bidding' || phase === 'playing')
      return `Hand #${handNumber}`;
    if (phase === 'complete') return 'Complete';
    return phase;
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gold mb-2">🐐 GoatBridge</h1>
          <p className="text-cream/60">Contract Bridge — real-time multiplayer</p>
        </div>

        {/* Pending invites */}
        {invites.invites.length > 0 && (
          <div className="bg-navy border border-gold rounded-xl p-6 shadow-2xl">
            <h2 className="text-gold font-bold text-lg mb-3">Table Invites</h2>
            <div className="space-y-2">
              {invites.invites.map(inv => (
                <div
                  key={inv.roomCode}
                  className="flex items-center justify-between gap-2 bg-navy/60 border border-gold/20 rounded-lg px-4 py-3"
                >
                  <span className="text-cream text-sm min-w-0 truncate">
                    <span className="font-bold">{inv.fromUsername}</span> invited you
                  </span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => acceptInvite(inv.roomCode)}
                      disabled={submitting}
                      className="bg-gold hover:bg-gold/80 text-navy font-bold px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      Join
                    </button>
                    <button
                      onClick={() => invites.dismissInvite(inv.roomCode)}
                      className="border border-cream/30 hover:border-cream/70 text-cream/70 px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active rooms */}
        {activeRooms.length > 0 && (
          <div className="bg-navy border border-gold/30 rounded-xl p-6 shadow-2xl">
            <h2 className="text-gold font-bold text-lg mb-3">Your Active Tables</h2>
            <div className="space-y-2">
              {activeRooms.map(room => (
                <div
                  key={room.roomCode}
                  className="flex items-center justify-between bg-navy/60 border border-gold/20 rounded-lg px-4 py-3"
                >
                  <div>
                    <span className="text-gold font-mono font-bold tracking-widest text-lg">
                      {room.roomCode}
                    </span>
                    <span className="text-cream/50 text-xs ml-3 capitalize">
                      {room.seat} · {phaseLabel(room.phase, room.handNumber)}
                    </span>
                  </div>
                  <button
                    onClick={() => rejoinRoom(room.roomCode)}
                    disabled={submitting}
                    className="bg-gold hover:bg-gold/80 text-navy font-bold px-4 py-1.5 rounded-lg text-sm transition-colors"
                  >
                    Rejoin
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Room */}
        <div className="bg-navy border border-gold/30 rounded-xl p-6 shadow-2xl">
          <h2 className="text-gold font-bold text-lg mb-4">Create a Table</h2>
          <p className="text-cream/60 text-sm mb-3">
            You'll be the host — invite players, remove them, and change table settings.
          </p>
          <div className="flex gap-2 mb-4">
            {(['public', 'invite_only'] as TableVisibility[]).map(v => (
              <button
                key={v}
                onClick={() => setNewTableVisibility(v)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold border transition-colors ${
                  newTableVisibility === v
                    ? 'bg-gold text-navy border-gold'
                    : 'bg-navy text-cream/70 border-gold/30 hover:border-gold/60'
                }`}
              >
                {v === 'public' ? '🌍 Public' : '🔒 Invite only'}
              </button>
            ))}
          </div>
          <p className="text-cream/40 text-xs mb-4">
            {newTableVisibility === 'public'
              ? 'Anyone can see this table in the lobby and take a free seat.'
              : 'Only players you invite can sit down. Others can ask to join.'}
          </p>
          <button
            onClick={createRoom}
            disabled={submitting}
            className="w-full bg-gold hover:bg-gold-light text-navy font-bold py-3 rounded-lg transition-colors text-lg"
          >
            {submitting ? 'Opening…' : 'Create Table'}
          </button>
        </div>

        {/* Table browser */}
        <div className="bg-navy border border-gold/30 rounded-xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gold font-bold text-lg">Open Tables</h2>
            <button
              onClick={loadTables}
              className="text-cream/50 hover:text-cream text-xs border border-cream/20 hover:border-cream/50 rounded px-2 py-1 transition-colors"
            >
              Refresh
            </button>
          </div>

          {tables.length === 0 ? (
            <p className="text-cream/40 text-sm text-center py-4">
              No open tables right now. Create one above!
            </p>
          ) : (
            <div className="space-y-2">
              {tables.map(t => {
                const canSit = t.openSeats > 0 && (t.visibility === 'public' || t.invited);
                return (
                  <div
                    key={t.roomCode}
                    className="bg-navy/60 border border-gold/20 rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-cream font-bold truncate">
                            {t.hostName}'s table
                          </span>
                          <span title={t.visibility === 'public' ? 'Public' : 'Invite only'}>
                            {t.visibility === 'public' ? '🌍' : '🔒'}
                          </span>
                        </div>
                        <div className="text-cream/50 text-xs mt-0.5">
                          {t.openSeats > 0 ? `${t.openSeats} seat${t.openSeats === 1 ? '' : 's'} open` : 'Full'}
                          {' · '}
                          {t.phase === 'waiting' ? 'Waiting' : 'In play'}
                          {t.spectatorCount > 0 && ` · ${t.spectatorCount} watching`}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {canSit && (
                          <button
                            onClick={() => joinTable(t.roomCode, false)}
                            disabled={submitting}
                            className="bg-gold hover:bg-gold/80 text-navy font-bold px-3 py-1.5 rounded-lg text-sm transition-colors"
                          >
                            Join
                          </button>
                        )}
                        {!canSit && t.visibility === 'invite_only' && !t.invited && (
                          <button
                            onClick={() => askToJoin(t.roomCode)}
                            className="border border-gold/40 hover:border-gold text-gold font-bold px-3 py-1.5 rounded-lg text-sm transition-colors"
                          >
                            Ask to join
                          </button>
                        )}
                        {t.kibitzingAllowed && (
                          <button
                            onClick={() => joinTable(t.roomCode, true)}
                            disabled={submitting}
                            className="border border-cream/30 hover:border-cream/70 text-cream/80 px-3 py-1.5 rounded-lg text-sm transition-colors"
                          >
                            Watch
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>

        <p className="text-center text-cream/30 text-xs">
          GoatBridge v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
