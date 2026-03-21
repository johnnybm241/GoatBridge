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

/** Small text counter in the corner: "We 3 / They 2" */
function TrickCounter({ ourTricks, theirTricks }: { ourTricks: number; theirTricks: number }) {
  return (
    <div className="flex gap-2 text-[10px] font-medium leading-none">
      <span className="text-cream/70">We <span className="text-gold font-bold">{ourTricks}</span></span>
      <span className="text-cream/30">/</span>
      <span className="text-cream/50">They <span className="text-cream/70 font-bold">{theirTricks}</span></span>
    </div>
  );
}

/** Fanned row of face-down trick cards placed on the table in front of the bottom seat.
 *  Won tricks (by this side) = portrait; Lost tricks = landscape (rotated). */
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

  const CW = 36;      // portrait card width px
  const CH = 52;      // portrait card height px
  const OVERLAP = -16; // negative left margin for fanning

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

// Bridge play order is clockwise: N → E → S → W
// But when sitting North facing South, East is to your LEFT and West to your RIGHT.
const CLOCKWISE: Record<Seat, Seat> = { north: 'east', east: 'south', south: 'west', west: 'north' };
const CCW: Record<Seat, Seat> = { north: 'west', west: 'south', south: 'east', east: 'north' };

/** Returns seats mapped to table positions from the viewer's perspective. */
function getSeatsFromPerspective(yourSeat: Seat | null): {
  bottom: Seat; left: Seat; top: Seat; right: Seat;
} {
  const bottom: Seat = yourSeat ?? 'south';
  const left = CLOCKWISE[bottom];   // clockwise neighbor is to your LEFT when facing partner
  const top = CLOCKWISE[left];      // partner (opposite)
  const right = CCW[bottom];        // counter-clockwise neighbor is to your RIGHT
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

  const getHandForSeat = (seat: Seat): CardType[] => {
    if (seat === yourSeat) return yourHand;
    if (seat === dummy && dummyHand) return dummyHand;
    return [];
  };

  const contractText = contract
    ? `${contract.level}${contract.strain === 'notrump' ? 'NT' : contract.strain[0]?.toUpperCase()}${contract.doubled === 'doubled' ? 'x' : contract.doubled === 'redoubled' ? 'xx' : ''} by ${contract.declarer}`
    : null;

  const nsTricks = trickCounts.ns;
  const ewTricks = trickCounts.ew;

  const renderSeat = (seat: Seat, position: 'bottom' | 'top' | 'left' | 'right') => {
    const isDummy = dummy === seat && phase === 'playing' && dummyHand;
    const isBottom = position === 'bottom';
    const isTop = position === 'top';
    const isLeft = position === 'left';

    const trickCount = (seat === 'north' || seat === 'south') ? nsTricks : ewTricks;

    const nameplate = (
      <SeatNameplate
        seat={seat}
        info={seats[seat]}
        isCurrentTurn={currentTurn === seat}
        isDeclarer={declarer === seat}
        isDummy={dummy === seat}
        trickCount={trickCount}
      />
    );

    const handCards = getHandForSeat(seat);
    const hand = isDummy ? (
      <DummyHand
        cards={dummyHand}
        dummySeat={seat}
        position={position}
        onPlay={onPlay}
        canPlay={canPlayCard && currentTurn === seat}
        trumpSuit={contract && contract.strain !== 'notrump' ? contract.strain as CardType['suit'] : null}
      />
    ) : handCards.length > 0 ? (
      <Hand
        cards={handCards}
        onPlay={onPlay}
        isYourTurn={(seat === yourSeat ? isYourTurn : false) || (isDeclarerTurn && seat === dummy)}
        size="lg"
      />
    ) : null;

    if (isBottom) {
      return (
        <div
          key={seat}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col-reverse items-center gap-1 z-10 pb-2"
        >
          {phase === 'playing' && completedTricks.length > 0 && (
            <TrickFan completedTricks={completedTricks} yourSeat={yourSeat} skin={activeCardBackSkin} />
          )}
          {invalidCardMessage && (
            <div className="text-red-400 text-xs font-bold bg-navy/80 rounded px-2 py-0.5 pointer-events-none">
              {invalidCardMessage}
            </div>
          )}
          {nameplate}
          {hand}
        </div>
      );
    }
    if (isTop) {
      return (
        <div
          key={seat}
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10"
          style={{ top: '4%' }}
        >
          {nameplate}
          {hand}
        </div>
      );
    }
    if (isLeft) {
      return (
        <div
          key={seat}
          className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10"
        >
          {nameplate}
          {hand}
        </div>
      );
    }
    // right
    return (
      <div
        key={seat}
        className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-row-reverse items-center gap-2 z-10"
      >
        {nameplate}
        {hand}
      </div>
    );
  };

  return (
    <div className="relative w-full h-full felt-texture rounded-2xl overflow-hidden shadow-2xl border-4 border-felt-dark/50 min-h-[280px] sm:min-h-[380px] md:min-h-[480px] lg:min-h-[560px]">
      {/* Table oval */}
      <div className="absolute inset-8 rounded-full border-2 border-felt-light/20 pointer-events-none" />

      {/* Contract display */}
      {contractText && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-navy/80 rounded px-3 py-1 text-gold text-sm font-bold border border-gold/30 z-10">
          {contractText}
        </div>
      )}

      {renderSeat(top, 'top')}
      {renderSeat(left, 'left')}
      {renderSeat(right, 'right')}
      {renderSeat(bottom, 'bottom')}

      {/* Center trick area */}
      <div className="absolute" style={{ top: '30%', left: '30%', right: '30%', bottom: '30%' }}>
        <TrickArea currentTrick={displayTrick} yourSeat={yourSeat} isStatic={showLastTrick} />
      </div>

      {/* Bottom-left controls: trick counter + last trick + undo */}
      <div className="absolute bottom-2 left-2 z-20 flex flex-col items-start gap-1.5">
        {phase === 'playing' && (() => {
          const isNS = yourSeat === 'north' || yourSeat === 'south' || !yourSeat;
          return <TrickCounter ourTricks={isNS ? nsTricks : ewTricks} theirTricks={isNS ? ewTricks : nsTricks} />;
        })()}
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

      {/* Scoreboard */}
      <div className="absolute top-2 right-2 z-20">
        <Scoreboard scores={scores} vulnerability={vulnerability} />
      </div>

      {/* Auction history during bidding */}
      {phase === 'bidding' && (
        <div className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <AuctionHistory bidding={bidding} dealer={gameState.dealer} vulnerability={vulnerability} />
        </div>
      )}

      {/* Bidding box — always visible during bidding, disabled when not your turn */}
      {phase === 'bidding' && (
        <div className="absolute bottom-4 right-4 z-30">
          <BiddingBox
            biddingState={bidding}
            onBid={onBid}
            disabled={!isYourTurn}
          />
        </div>
      )}

      {/* Claim button — bottom right during play */}
      {phase === 'playing' && yourSeat && (yourSeat === declarer || yourSeat === dummy) && !claimFromSeat && !undoFromSeat && (
        <div className="absolute bottom-4 right-4 z-20">
          <button
            onClick={() => getSocket().emit('request_claim', { roomCode })}
            className="bg-navy/90 border border-gold/50 hover:border-gold text-gold font-bold px-4 py-2 rounded-lg transition-colors text-sm min-h-[40px] min-w-[90px] shadow-lg"
          >
            Claim
          </button>
        </div>
      )}


      {/* Claim response overlay — opponents only */}
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

      {/* Undo response overlay — everyone except the requester */}
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


      {/* Scoring overlay after hand completes */}
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
