import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, initSocket } from '../socket.js';
import { useAuthStore } from '../store/authStore.js';
import { useGameStore } from '../store/gameStore.js';
import { APP_VERSION } from '../version.js';

export default function LobbyPage() {
  const [roomCode, setRoomCode] = useState('');
  const [spectate, setSpectate] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const auth = useAuthStore();
  const gameStore = useGameStore();

  useEffect(() => {
    // Initialize socket if we have a token but no socket
    if (auth.token) {
      try {
        getSocket();
      } catch {
        initSocket(auth.token);
      }
    }
  }, [auth.token]);

  const createRoom = () => {
    setError('');
    const socket = getSocket();
    (socket as unknown as { emit: (event: string, cb: (result: { roomCode?: string; error?: string }) => void) => void })
      .emit('create_room', (result: { roomCode?: string; error?: string }) => {
        if (result.error) { setError(result.error); return; }
        if (result.roomCode) {
          gameStore.setRoom(result.roomCode, auth.userId!, false);
          navigate(`/game/${result.roomCode}`);
        }
      });
  };

  const joinRoom = () => {
    if (!roomCode.trim()) { setError('Enter a room code'); return; }
    setError('');
    const socket = getSocket();
    socket.emit('join_room', { roomCode: roomCode.toUpperCase(), spectate });
    socket.once('room_joined', (payload) => {
      gameStore.setRoom(payload.roomCode, payload.hostUserId, payload.isSpectator);
      navigate(`/game/${payload.roomCode}`);
    });
    socket.once('room_error', (payload) => {
      setError(payload.message);
    });
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gold mb-2">🐐 GoatBridge</h1>
          <p className="text-cream/60">Contract Bridge — real-time multiplayer</p>
        </div>

        {/* Create Room */}
        <div className="bg-navy border border-gold/30 rounded-xl p-6 shadow-2xl">
          <h2 className="text-gold font-bold text-lg mb-4">Create a Table</h2>
          <p className="text-cream/60 text-sm mb-4">
            Start a new room. You'll be the host and can add AI bots to fill empty seats.
          </p>
          <button
            onClick={createRoom}
            className="w-full bg-gold hover:bg-gold-light text-navy font-bold py-3 rounded-lg transition-colors text-lg"
          >
            Create Room
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
              placeholder="Room Code (e.g. ABC123)"
              maxLength={6}
              className="w-full bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors uppercase tracking-widest font-mono"
            />
            <label className="flex items-center gap-2 text-cream/70 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={spectate}
                onChange={e => setSpectate(e.target.checked)}
                className="accent-gold"
              />
              Join as spectator (kibitz)
            </label>
            <button
              onClick={joinRoom}
              className="w-full bg-felt hover:bg-felt-light text-cream font-bold py-3 rounded-lg transition-colors border border-felt-light"
            >
              Join Room
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
