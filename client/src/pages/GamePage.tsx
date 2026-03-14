import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameState } from '../hooks/useGameState.js';
import { useSocketEvents } from '../hooks/useSocket.js';
import { useAuthStore } from '../store/authStore.js';
import { getSocket } from '../socket.js';
import BridgeTable from '../components/game/BridgeTable.js';
import RoomChat from '../components/chat/RoomChat.js';
import HostAdminPanel from '../components/admin/HostAdminPanel.js';
import type { BidCall, Card } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const auth = useAuthStore();
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
    roomSeats,
    roomKibitzingAllowed,
    roomSpectators,
    lastHandResult,
  } = useGameState();

  useSocketEvents();

  useEffect(() => {
    if (!roomCode || !auth.token) navigate('/');
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

  return (
    <div className="flex h-[calc(100vh-48px)] gap-3 p-3 bg-navy">
      {/* Main table */}
      <div className="flex-1 flex flex-col gap-3">
        {/* Room code header */}
        <div className="flex items-center justify-between text-sm">
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

      {/* Right sidebar */}
      <div className="w-64 flex flex-col gap-3">
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
