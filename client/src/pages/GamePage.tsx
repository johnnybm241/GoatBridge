import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameState } from '../hooks/useGameState.js';
import { useAuthStore } from '../store/authStore.js';
import { useGameStore } from '../store/gameStore.js';
import { getSocket, initSocket } from '../socket.js';
import BridgeTable from '../components/game/BridgeTable.js';
import RoomChat from '../components/chat/RoomChat.js';
import HostAdminPanel from '../components/admin/HostAdminPanel.js';
import type { BidCall, Card } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 256;

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const auth = useAuthStore();
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const dragging = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const containerRight = document.documentElement.clientWidth;
      const newWidth = containerRight - ev.clientX;
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, newWidth)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);
  const {
    gameState,
    yourSeat,
    yourHand,
    messages,
    isHost,
    hostUserId,
    isSpectator,
    isYourTurn,
    goatToast,
    clearGoatToast,
    bleatsToast,
    clearBleatsToast,
    roomSeats,
    roomKibitzingAllowed,
    roomSpectators,
    lastHandResult,
  } = useGameState();

  useEffect(() => {
    if (!roomCode || !auth.token) { navigate('/'); return; }

    // Ensure socket exists and is connected
    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
      if (!socket.connected) socket.connect();
    } catch {
      socket = initSocket(auth.token);
    }

    // If store doesn't have this room yet (direct URL nav / page refresh / rejoin),
    // emit join_room so the server re-sends room state
    const { roomCode: storeRoom, setRoom, setRoomLobby } = useGameStore.getState();
    if (storeRoom !== roomCode) {
      // Use named handlers so we can cross-clean — prevents orphaned room_error
      // handler kicking user to lobby when an unrelated error fires later
      const handlers = {
        joined(payload: { roomCode: string; hostUserId: string; isSpectator: boolean; seats: any; kibitzingAllowed: boolean; spectators: any[] }) {
          socket.off('room_error', handlers.error);
          setRoom(payload.roomCode, payload.hostUserId, payload.isSpectator);
          setRoomLobby(payload.seats, payload.kibitzingAllowed, payload.spectators);
        },
        error() {
          socket.off('room_joined', handlers.joined);
          navigate('/');
        },
      };
      socket.once('room_joined', handlers.joined);
      socket.once('room_error', handlers.error);
      socket.emit('join_room', { roomCode });
    }
  }, [roomCode, auth.token]);

  const handleBid = (call: BidCall) => {
    if (!roomCode) return;
    getSocket().emit('make_bid', { roomCode, call });
  };

  const handlePlay = (card: Card) => {
    if (!roomCode) return;
    getSocket().emit('play_card', { roomCode, card });
  };

  // Goat toast auto-dismiss
  useEffect(() => {
    if (!goatToast) return;
    const t = setTimeout(() => clearGoatToast(), 3000);
    return () => clearTimeout(t);
  }, [goatToast?.id]);

  // Bleats toast auto-dismiss
  useEffect(() => {
    if (!bleatsToast) return;
    const t = setTimeout(() => clearBleatsToast(), 3000);
    return () => clearTimeout(t);
  }, [bleatsToast?.id]);

  return (
    <div className="flex h-full min-h-0 gap-0 p-0 sm:gap-2 sm:p-2 md:gap-3 md:p-3 bg-navy">
      {/* Main table */}
      <div className="flex-1 flex flex-col gap-2 md:gap-3 min-w-0">
        {/* Room code header */}
        <div className="flex items-center justify-between text-xs sm:text-sm px-2 sm:px-0 py-1 sm:py-0">
          <div className="text-cream/50">
            Room: <span className="text-gold font-mono font-bold tracking-widest">{roomCode}</span>
            {isSpectator && <span className="ml-2 text-blue-400">(Spectating)</span>}
          </div>
          {gameState && (
            <div className="text-cream/50">
              Hand #{gameState.handNumber} •{' '}
              <span className={
                gameState.vulnerability === 'both' ? 'text-red-400' :
                gameState.vulnerability === 'none' ? 'text-cream/50' : 'text-red-400'
              }>
                {gameState.vulnerability === 'none' ? 'None vul' :
                 gameState.vulnerability === 'both' ? 'All vul' :
                 `${gameState.vulnerability.toUpperCase()} vul`}
              </span>
            </div>
          )}
        </div>

        {/* Bridge table */}
        <div className="flex-1 min-h-0">
          {gameState ? (
            <BridgeTable
              gameState={gameState}
              yourSeat={yourSeat}
              yourHand={yourHand}
              onBid={handleBid}
              onPlay={handlePlay}
              isYourTurn={isYourTurn()}
              isHost={isHost}
              lastHandResult={lastHandResult}
              roomCode={roomCode!}
            />
          ) : (
            <WaitingRoom
              roomCode={roomCode!}
              isHost={isHost}
              hostUserId={hostUserId}
            />
          )}
        </div>
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="hidden lg:flex items-center justify-center w-2 cursor-col-resize group shrink-0"
      >
        <div className="w-0.5 h-16 rounded-full bg-gold/20 group-hover:bg-gold/60 transition-colors" />
      </div>

      {/* Right sidebar — hidden on small screens */}
      <div className="hidden lg:flex flex-col gap-3 shrink-0" style={{ width: sidebarWidth }}>
        {isHost && (
          <HostAdminPanel
            roomCode={roomCode!}
            gameState={gameState}
            seats={roomSeats ?? ({} as Record<Seat, { userId: string | null; isAI: boolean; displayName: string }>)}
            kibitzingAllowed={roomKibitzingAllowed}
            spectators={roomSpectators}
          />
        )}

        <div className="flex-1 min-h-0">
          <RoomChat messages={messages} roomCode={roomCode!} />
        </div>
      </div>

      {/* Goat toast */}
      <AnimatePresence>
        {goatToast && (
          <motion.div
            key={goatToast.id}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed bottom-8 right-8 bg-gold text-navy font-bold px-4 py-2 rounded-xl shadow-2xl text-lg z-50"
          >
            +{goatToast.amount} 🐐
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bleats toast */}
      <AnimatePresence>
        {bleatsToast && (
          <motion.div
            key={bleatsToast.id}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed bottom-20 right-8 bg-purple-700 text-white font-bold px-4 py-2 rounded-xl shadow-2xl text-sm z-50 flex flex-col items-end"
          >
            <span className="text-base">+{bleatsToast.amount} Bleats 🐐</span>
            <span className="text-purple-200 font-normal text-xs">{bleatsToast.reason}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WaitingRoom({ roomCode, isHost, hostUserId }: { roomCode: string; isHost: boolean; hostUserId: string | null }) {
  return (
    <div className="felt-texture rounded-2xl h-full flex flex-col items-center justify-center gap-4 text-cream/70 border-4 border-felt-dark/50">
      <div className="text-6xl">🐐</div>
      <div className="text-2xl font-bold text-gold">Waiting for players…</div>
      <div className="text-sm">
        Share this room code:{' '}
        <span className="text-gold font-mono font-bold text-lg tracking-widest">{roomCode}</span>
      </div>
      {isHost && (
        <p className="text-cream/50 text-sm">Use the Host Controls panel →</p>
      )}
    </div>
  );
}
