import { useState } from 'react';
import { useAuthStore } from '../../store/authStore.js';
import type { GameState, Seat, Card as CardType, Contract } from '@goatbridge/shared';
import Hand from './Hand.js';
import DummyHand from './DummyHand.js';
import BiddingBox from './BiddingBox.js';
import AuctionHistory from './AuctionHistory.js';
import TrickArea from './TrickArea.js';
import SeatNameplate from './SeatNameplate.js';
import Scoreboard from './Scoreboard.js';
import type { BidCall } from '@goatbridge/shared';
import { getSocket } from '../../socket.js';
import { useGameStore } from '../../store/gameStore.js';

interface BridgeTableProps {
  gameState: GameState;
  yourSeat: Seat | null;
  yourHand: CardType[];
  onBid: (call: BidCall) => void;
  onPlay: (card: CardType) => void;
  isYourTurn: boolean;
  isHost: boolean;
  roomCode: string;
  lastHandResult: { contract: Contract; declarer: Seat; tricksMade: number; contractMade: boolean } | null;
}

const SKIN_STYLES: Record<string, { bg: string; border: string; inner: string; symbol: string }> = {
  'classic':   { bg: '#1e3a6b', border: '#1d4ed8', inner: '#3b82f6', symbol: '✦' },
  'ocean':     { bg: '#0c4a6e', border: '#0891b2', inner: '#22d3ee', symbol: '〜' },
  'midnight':  { bg: '#1e1b4b', border: '#4338ca', inner: '#818cf8', symbol: '★' },
  'gold-foil': { bg: '#451a03', border: '#ca8a04', inner: '#fbbf24', symbol: '◈' },
  'crimson':   { bg: '#450a0a', border: '#b91c1c', inner: '#f87171', symbol: '♦' },
  'forest':    { bg: '#052e16', border: '#15803d', inner: '#4ade80', symbol: '♣' },
};

function TrickCounter({ ourTricks, theirTricks }: { ourTricks: number; theirTricks: number }) {
  return (
    <div className="flex gap-2 text-[10px] font-medium leading-none">
      <span className="text-cream/70">We <span className="text-gold font-bold">{ourTricks}</span></span>
      <span className="text-cream/30">/</span>
      <span className="text-cream/50">They <span className="text-cream/70 font-bold">{theirTricks}</span></span>
    </div>
  );
}

function TrickFan({
  completedTricks,
  yourSeat,
  skin,
}: {
  completedTricks: import('@goatbridge/shared').Trick[];
  yourSeat: Seat | null;
  skin: string;
}) {
  if (completedTricks.length === 0) return null;

  const style = SKIN_STYLES[skin] ?? SKIN_STYLES['classic'];
  const isNS = !yourSeat || yourSeat === 'north' || yourSeat === 'south';

  const CW = 28;
  const CH = 40;
  const OVERLAP = -12;

  return (
    <div className="flex items-end" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }}>
      {completedTricks.map((trick, i) => {
        const winner = trick.winner;
        const won = winner
          ? (isNS ? (winner === 'north' || winner === 'south') : (winner === 'east' || winner === 'west'))
          : false;

        const w = won ? CW : CH;
        const h = won ? CH : CW;

        return (
          <div
            key={i}
            className="rounded flex-shrink-0"
            style={{
              width: w,
              height: h,
              marginLeft: i > 0 ? OVERLAP : 0,
              zIndex: i,
              backgroundColor: style.bg,
              border: `2px solid ${style.border}`,
              position: 'relative',
              boxShadow: '1px 1px 3px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 3,
                borderRadius: 2,
                border: `1px solid ${style.inner}50`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: `${style.inner}70`,
                fontSize: Math.min(w, h) * 0.38,
              }}
            >
              {style.symbol}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CLOCKWISE: Record<Seat, Seat> = { north: 'east', east: 'south', south: 'west', west: 'north' };
const CCW: Record<Seat, Seat> = { north: 'west', west: 'south', south: 'east', east: 'north' };

function getSeatsFromPerspective(yourSeat: Seat | null): { bottom: Seat; left: Seat; top: Seat; right: Seat } {
  const bottom: Seat = yourSeat ?? 'south';
  const left = CLOCKWISE[bottom];
  const top = CLOCKWISE[left];
  const right = CCW[bottom];
  return { bottom, left, top, right };
}

export default function BridgeTable({
  gameState,
  yourSeat,
  yourHand,
  onBid,
  onPlay,
  isYourTurn,
  isHost,
  roomCode,
  lastHandResult,
}: BridgeTableProps) {
  const [showLastTrick, setShowLastTrick] = useState(false);
  const claimFromSeat = useGameStore(s => s.claimFromSeat);
  const undoFromSeat = useGameStore(s => s.undoFromSeat);
  const invalidCardMessage = useGameStore(s => s.invalidCardMessage);
  const activeCardBackSkin = useAuthStore(s => s.activeCardBackSkin);

  const { phase, bidding, currentTurn, contract, declarer, dummy, dummyHand, seats, trickCounts, scores, vulnerability, completedTricks } = gameState;
  const { bottom, left, top, right } = getSeatsFromPerspective(yourSeat);

  const lastTrick = completedTricks.length > 0 ? completedTricks[completedTricks.length - 1] : null;
  const displayTrick = showLastTrick && lastTrick ? lastTrick : gameState.currentTrick;

  const isDeclarerTurn = currentTurn === dummy && yourSeat === declarer;
  const canPlayCard = isYourTurn || isDeclarerTurn;
  const isNS = yourSeat === 'north' || yourSeat === 'south' || !yourSeat;

  const contractText = contract
    ? `${contract.level}${contract.strain === 'notrump' ? 'NT' : contract.strain[0]?.toUpperCase()}${contract.doubled === 'doubled' ? 'x' : contract.doubled === 'redoubled' ? 'xx' : ''} by ${contract.declarer}`
    : null;

  const nsTricks = trickCounts.ns;
  const ewTricks = trickCounts.ew;

  const getHandForSeat = (seat: Seat): CardType[] => {
    if (seat === yourSeat) return yourHand;
    if (seat === dummy && dummyHand) return dummyHand;
    return [];
  };

  const renderNameplate = (seat: Seat) => {
    const trickCount = (seat === 'north' || seat === 'south') ? nsTricks : ewTricks;
    return (
      <SeatNameplate
        seat={seat}
        info={seats[seat]}
        isCurrentTurn={currentTurn === seat}
        isDeclarer={declarer === seat}
        isDummy={dummy === seat}
        trickCount={trickCount}
      />
    );
  };

  const renderHandContent = (seat: Seat) => {
    const isDummySeat = dummy === seat && phase === 'playing' && dummyHand;
    const handCards = getHandForSeat(seat);

    if (isDummySeat) {
      return (
        <DummyHand
          cards={dummyHand}
          dummySeat={seat}
          position="top"
          onPlay={onPlay}
          canPlay={canPlayCard && currentTurn === seat}
          trumpSuit={contract && contract.strain !== 'notrump' ? contract.strain as CardType['suit'] : null}
        />
      );
    }

    if (handCards.length > 0) {
      return (
        <Hand
          cards={handCards}
          onPlay={onPlay}
          isYourTurn={(seat === yourSeat ? isYourTurn : false) || (isDeclarerTurn && seat === dummy)}
          size="lg"
        />
      );
    }

    return null;
  };

  return (
    <div className="relative flex flex-col w-full h-full felt-texture rounded-none sm:rounded-2xl overflow-hidden shadow-2xl border-0 sm:border-4 border-felt-dark/50">

      {/* Table oval decoration */}
      <div className="absolute inset-4 sm:inset-8 rounded-full border-2 border-felt-light/20 pointer-events-none z-0" />

      {/* Scoreboard — absolute top-right */}
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 z-20 scale-75 sm:scale-100 origin-top-right">
        <Scoreboard scores={scores} vulnerability={vulnerability} />
      </div>

      {/* Contract — absolute top-center */}
      {contractText && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-navy/80 rounded px-3 py-1 text-gold text-sm font-bold border border-gold/30 z-10 whitespace-nowrap pointer-events-none">
          {contractText}
        </div>
      )}

      {/* ── TOP SEAT ── */}
      <div className="flex justify-center items-start pt-2 sm:pt-3 shrink-0 z-10">
        <div className="flex flex-col items-center gap-0.5">
          {renderNameplate(top)}
          {renderHandContent(top)}
        </div>
      </div>

      {/* ── MIDDLE ROW: left | center | right ── */}
      <div className="flex flex-1 items-center min-h-0 z-10 px-1 gap-1">
        {/* Left seat */}
        <div className="shrink-0 flex flex-col items-center gap-0.5">
          {renderNameplate(left)}
          {renderHandContent(left)}
        </div>

        {/* Center: auction history or trick area */}
        <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden">
          {phase === 'bidding' ? (
            <AuctionHistory bidding={bidding} dealer={gameState.dealer} vulnerability={vulnerability} />
          ) : (
            <TrickArea currentTrick={displayTrick} yourSeat={yourSeat} isStatic={showLastTrick} />
          )}
        </div>

        {/* Right seat */}
        <div className="shrink-0 flex flex-col items-center gap-0.5">
          {renderNameplate(right)}
          {renderHandContent(right)}
        </div>
      </div>

      {/* ── BOTTOM SEAT: trick fan + nameplate + hand ── */}
      <div className="flex flex-col items-center shrink-0 z-10 gap-0.5 px-2 pt-1">
        {invalidCardMessage && (
          <div className="text-red-400 text-xs font-bold bg-navy/80 rounded px-2 py-0.5 pointer-events-none">
            {invalidCardMessage}
          </div>
        )}
        {phase === 'playing' && completedTricks.length > 0 && (
          <TrickFan completedTricks={completedTricks} yourSeat={yourSeat} skin={activeCardBackSkin} />
        )}
        {renderNameplate(bottom)}
        {renderHandContent(bottom)}
      </div>

      {/* ── BOTTOM BAR: controls left | bidding box / claim right ── */}
      <div className="flex items-end justify-between shrink-0 px-2 pb-2 pt-1 gap-2 z-20">
        {/* Left controls */}
        <div className="flex flex-col items-start gap-1.5">
          {phase === 'playing' && (
            <TrickCounter ourTricks={isNS ? nsTricks : ewTricks} theirTricks={isNS ? ewTricks : nsTricks} />
          )}
          {phase === 'playing' && lastTrick && (
            <button
              onMouseDown={() => setShowLastTrick(true)}
              onMouseUp={() => setShowLastTrick(false)}
              onMouseLeave={() => setShowLastTrick(false)}
              onTouchStart={() => setShowLastTrick(true)}
              onTouchEnd={() => setShowLastTrick(false)}
              className="block text-cream/80 hover:text-cream border border-cream/40 hover:border-cream/70 rounded px-2 py-1 text-xs font-bold transition-colors select-none"
            >
              Last trick
            </button>
          )}
          {(phase === 'playing' || phase === 'bidding') && yourSeat && !claimFromSeat && !undoFromSeat && (
            <button
              onClick={() => getSocket().emit('request_undo', { roomCode })}
              className="flex items-center gap-1 text-cream/70 hover:text-cream border border-cream/30 hover:border-cream/60 rounded-lg px-3 py-2 text-xs font-bold transition-colors min-h-[34px]"
            >
              ↩ Undo
            </button>
          )}
          {undoFromSeat && yourSeat && yourSeat === undoFromSeat && (
            <div className="text-cream/60 text-xs font-bold">Waiting…</div>
          )}
        </div>

        {/* Right: bidding box (during bidding) or claim button (during play) */}
        {phase === 'bidding' && (
          <div className="max-h-[42vh] sm:max-h-none overflow-y-auto shrink-0">
            <BiddingBox
              biddingState={bidding}
              onBid={onBid}
              disabled={!isYourTurn}
            />
          </div>
        )}
        {phase === 'playing' && yourSeat && (yourSeat === declarer || yourSeat === dummy) && !claimFromSeat && !undoFromSeat && (
          <button
            onClick={() => getSocket().emit('request_claim', { roomCode })}
            className="bg-navy/90 border border-gold/50 hover:border-gold text-gold font-bold px-4 py-2 rounded-lg transition-colors text-sm min-h-[40px] min-w-[90px] shadow-lg shrink-0"
          >
            Claim
          </button>
        )}
      </div>

      {/* ── OVERLAYS ── */}

      {/* Claim response (opponents) */}
      {claimFromSeat && yourSeat && yourSeat !== declarer && yourSeat !== dummy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-navy/60">
          <div className="bg-navy border border-gold/40 rounded-2xl p-6 text-center shadow-2xl space-y-4 min-w-[260px]">
            <div className="text-gold font-bold text-lg">Claim</div>
            <div className="text-cream text-sm">
              <span className="font-bold capitalize">{claimFromSeat}</span> is claiming all remaining tricks.
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => getSocket().emit('respond_claim', { roomCode, accept: true })}
                className="flex-1 bg-green-700 hover:bg-green-600 text-cream font-bold py-2 rounded-lg transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => getSocket().emit('respond_claim', { roomCode, accept: false })}
                className="flex-1 bg-red-800 hover:bg-red-700 text-cream font-bold py-2 rounded-lg transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting indicator for claimer */}
      {claimFromSeat && yourSeat && (yourSeat === declarer || yourSeat === dummy) && (
        <div className="absolute bottom-4 right-4 z-20 bg-navy/90 border border-gold/30 rounded-lg px-3 py-1.5 text-gold text-xs font-bold">
          Waiting for opponents…
        </div>
      )}

      {/* Undo response overlay */}
      {undoFromSeat && yourSeat && yourSeat !== undoFromSeat && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-navy/60">
          <div className="bg-navy border border-gold/40 rounded-2xl p-6 text-center shadow-2xl space-y-4 min-w-[260px]">
            <div className="text-gold font-bold text-lg">Undo Request</div>
            <div className="text-cream text-sm">
              <span className="font-bold capitalize">{undoFromSeat}</span> wants to undo the last action.
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => getSocket().emit('respond_undo', { roomCode, approve: true })}
                className="flex-1 bg-green-700 hover:bg-green-600 text-cream font-bold py-2 rounded-lg transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => getSocket().emit('respond_undo', { roomCode, approve: false })}
                className="flex-1 bg-red-800 hover:bg-red-700 text-cream font-bold py-2 rounded-lg transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scoring overlay */}
      {phase === 'scoring' && lastHandResult && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-navy/70">
          <div className="bg-navy border border-gold/40 rounded-2xl p-6 text-center shadow-2xl space-y-3 min-w-[260px]">
            <div className="text-gold font-bold text-xl">Hand Complete</div>
            <div className="text-cream text-lg font-semibold">
              {lastHandResult.contract.level}
              {lastHandResult.contract.strain === 'notrump' ? 'NT' : lastHandResult.contract.strain[0]?.toUpperCase()}
              {lastHandResult.contract.doubled === 'doubled' ? 'x' : lastHandResult.contract.doubled === 'redoubled' ? 'xx' : ''}
              {' '}by {lastHandResult.declarer}
            </div>
            <div className={`text-2xl font-bold ${lastHandResult.contractMade ? 'text-green-400' : 'text-red-400'}`}>
              {lastHandResult.contractMade
                ? `Made${lastHandResult.tricksMade > lastHandResult.contract.level + 6 ? ` +${lastHandResult.tricksMade - lastHandResult.contract.level - 6}` : ''}`
                : `Down ${lastHandResult.contract.level + 6 - lastHandResult.tricksMade}`}
            </div>
            {isHost && !gameState.scores.isComplete && (
              <button
                onClick={() => getSocket().emit('start_game', { roomCode })}
                className="mt-2 w-full bg-gold hover:bg-gold/80 text-navy font-bold py-2 rounded-lg transition-colors"
              >
                Deal Next Hand
              </button>
            )}
            {gameState.scores.isComplete && (
              <div className="text-gold font-bold text-lg pt-1">
                Rubber complete!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
