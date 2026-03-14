import type { GameState, Seat, Card as CardType, Contract } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';
import Hand from './Hand.js';
import DummyHand from './DummyHand.js';
import BiddingBox from './BiddingBox.js';
import AuctionHistory from './AuctionHistory.js';
import TrickArea from './TrickArea.js';
import SeatNameplate from './SeatNameplate.js';
import Scoreboard from './Scoreboard.js';
import type { BidCall } from '@goatbridge/shared';
import { getSocket } from '../../socket.js';

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
  const { phase, bidding, currentTurn, contract, declarer, dummy, dummyHand, seats, trickCounts, scores, vulnerability } = gameState;

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

  // Trick counts
  const nsTricks = trickCounts.ns;
  const ewTricks = trickCounts.ew;

  return (
    <div className="relative w-full h-full felt-texture rounded-2xl overflow-hidden shadow-2xl border-4 border-felt-dark/50 min-h-[600px]">
      {/* Table oval */}
      <div className="absolute inset-8 rounded-full border-2 border-felt-light/20 pointer-events-none" />

      {/* Contract display */}
      {contractText && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-navy/80 rounded px-3 py-1 text-gold text-sm font-bold border border-gold/30 z-10">
          {contractText}
        </div>
      )}

      {/* NORTH */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10" style={{ top: '12%' }}>
        <SeatNameplate
          seat="north"
          info={seats.north}
          isCurrentTurn={currentTurn === 'north'}
          isDeclarer={declarer === 'north'}
          isDummy={dummy === 'north'}
          trickCount={seats.north.seat === 'north' || seats.north.seat === 'south' ? nsTricks : ewTricks}
        />
        {phase === 'playing' && dummy === 'north' && dummyHand ? (
          <DummyHand
            cards={dummyHand}
            dummySeat="north"
            onPlay={onPlay}
            canPlay={canPlayCard && currentTurn === 'north'}
          />
        ) : (
          <Hand
            cards={getHandForSeat('north')}
            onPlay={onPlay}
            isYourTurn={canPlayCard && currentTurn === 'north'}
            size="sm"
          />
        )}
      </div>

      {/* SOUTH */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col-reverse items-center gap-1 z-10" style={{ bottom: '8%' }}>
        <SeatNameplate
          seat="south"
          info={seats.south}
          isCurrentTurn={currentTurn === 'south'}
          isDeclarer={declarer === 'south'}
          isDummy={dummy === 'south'}
        />
        {phase === 'playing' && dummy === 'south' && dummyHand ? (
          <DummyHand
            cards={dummyHand}
            dummySeat="south"
            onPlay={onPlay}
            canPlay={canPlayCard && currentTurn === 'south'}
          />
        ) : (
          <Hand
            cards={getHandForSeat('south')}
            onPlay={onPlay}
            isYourTurn={isYourTurn && yourSeat === 'south'}
            size="md"
          />
        )}
      </div>

      {/* WEST */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
        <SeatNameplate
          seat="west"
          info={seats.west}
          isCurrentTurn={currentTurn === 'west'}
          isDeclarer={declarer === 'west'}
          isDummy={dummy === 'west'}
        />
        {phase === 'playing' && dummy === 'west' && dummyHand ? (
          <DummyHand cards={dummyHand} dummySeat="west" onPlay={onPlay} canPlay={canPlayCard && currentTurn === 'west'} />
        ) : (
          <Hand cards={getHandForSeat('west')} onPlay={onPlay} isYourTurn={isYourTurn && yourSeat === 'west'} size="sm" />
        )}
      </div>

      {/* EAST */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-row-reverse items-center gap-2 z-10">
        <SeatNameplate
          seat="east"
          info={seats.east}
          isCurrentTurn={currentTurn === 'east'}
          isDeclarer={declarer === 'east'}
          isDummy={dummy === 'east'}
        />
        {phase === 'playing' && dummy === 'east' && dummyHand ? (
          <DummyHand cards={dummyHand} dummySeat="east" onPlay={onPlay} canPlay={canPlayCard && currentTurn === 'east'} />
        ) : (
          <Hand cards={getHandForSeat('east')} onPlay={onPlay} isYourTurn={isYourTurn && yourSeat === 'east'} size="sm" />
        )}
      </div>

      {/* Center trick area */}
      <div className="absolute" style={{ top: '30%', left: '30%', right: '30%', bottom: '30%' }}>
        <TrickArea currentTrick={gameState.currentTrick} />
      </div>

      {/* Trick counts bottom left */}
      <div className="absolute bottom-2 left-2 text-cream/60 text-xs space-y-0.5">
        <div>N/S: {nsTricks} tricks</div>
        <div>E/W: {ewTricks} tricks</div>
      </div>

      {/* Scoreboard */}
      <div className="absolute top-2 right-2 z-20">
        <Scoreboard scores={scores} vulnerability={vulnerability} />
      </div>

      {/* Auction history during bidding */}
      {phase === 'bidding' && (
        <div className="absolute" style={{ top: '40%', left: '35%' }}>
          <AuctionHistory bidding={bidding} dealer={gameState.dealer} />
        </div>
      )}

      {/* Bidding box */}
      {phase === 'bidding' && isYourTurn && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
          <BiddingBox
            biddingState={bidding}
            onBid={onBid}
            disabled={!isYourTurn}
          />
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
                🐐 Rubber complete!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
