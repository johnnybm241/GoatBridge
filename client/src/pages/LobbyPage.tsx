import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, initSocket } from '../socket.js';
import { useAuthStore } from '../store/authStore.js';
import { useGameStore } from '../store/gameStore.js';
import { APP_VERSION } from '../version.js';
import api from '../api.js';
import type { Seat, SeatInfo, SpectatorInfo } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

interface ActiveRoom {
  roomCode: string;
  seat: string;
  phase: string;
  handNumber: number;
}

export default function LobbyPage() {
  const [roomCode, setRoomCode] = useState('');
  const [spectate, setSpectate] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const navigate = useNavigate();
  const auth = useAuthStore();
  const gameStore = useGameStore();
  const roomJoinedHandlerRef = useRef<((payload: {
    roomCode: string;
    hostUserId: string;
    isSpectator: boolean;
    seats: Record<Seat, SeatInfo>;
    kibitzingAllowed: boolean;
    spectators: SpectatorInfo[];
  }) => void) | null>(null);
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
    const onJoined = (payload: {
      roomCode: string;
      hostUserId: string;
      isSpectator: boolean;
      seats: Record<Seat, SeatInfo>;
      kibitzingAllowed: boolean;
      spectators: SpectatorInfo[];
    }) => {
      clearRoomRequestHandlers(socket);
      setSubmitting(false);
      gameStore.setRoom(payload.roomCode, payload.hostUserId, payload.isSpectator);
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
    socket.emit('create_room');
  };

  const joinRoom = () => {
    if (!roomCode.trim()) { setError('Enter a room code'); return; }
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const socket = ensureSocket();
    setupRoomRequestHandlers(socket);
    socket.emit('join_room', { roomCode: roomCode.trim().toUpperCase(), spectate });
  };

  const rejoinRoom = (code: string) => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const socket = ensureSocket();
    setupRoomRequestHandlers(socket);
    socket.emit('join_room', { roomCode: code.toUpperCase(), spectate: false });
  };

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
          <p className="text-cream/60 text-sm mb-4">
            Start a new room. You'll be the host and can add AI bots to fill empty seats.
          </p>
          <button
            onClick={createRoom}
            disabled={submitting}
            className="w-full bg-gold hover:bg-gold-light text-navy font-bold py-3 rounded-lg transition-colors text-lg"
          >
            {submitting ? 'Opening…' : 'Create Room'}
          </button>
        </div>

        {/* Join Room */}
        <div className="bg-navy border border-gold/30 rounded-xl p-6 shadow-2xl">
          <h2 className="text-gold font-bold text-lg mb-4">Join a Table</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
              placeholder="Room Code (e.g. ABC123)"
              maxLength={6}
              className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors uppercase tracking-widest font-mono"
            />
            <label className="flex items-center gap-2 text-cream/70 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={spectate}
                onChange={e => setSpectate(e.target.checked)}
                disabled={submitting}
                className="accent-gold"
              />
              Join as spectator (kibitz)
            </label>
            <button
              onClick={joinRoom}
              disabled={submitting}
              className="w-full bg-felt hover:bg-felt-light text-cream font-bold py-3 rounded-lg transition-colors border border-felt-light"
            >
              {submitting ? 'Opening…' : 'Join Room'}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        <p className="text-center text-cream/30 text-xs">
          GoatBridge v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
