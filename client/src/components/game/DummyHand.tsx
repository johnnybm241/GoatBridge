import type { Card as CardType, Seat, Suit } from '@goatbridge/shared';
import { SUIT_SYMBOLS } from '@goatbridge/shared';
import Card from './Card.js';

interface DummyHandProps {
  cards: CardType[];
  dummySeat: Seat;
  position: 'top' | 'bottom' | 'left' | 'right';
  onPlay?: (card: CardType) => void;
  canPlay?: boolean;
  trumpSuit?: Suit | null;
}

// Trump-first, then remaining 3 suits in alternating black/red color order.
// No-trump default is B R B R.
const SUIT_ORDER: Record<Suit | 'notrump', Suit[]> = {
  spades:   ['spades',   'hearts',   'clubs',    'diamonds'], // B R B R
  clubs:    ['clubs',    'hearts',   'spades',   'diamonds'], // B R B R
  hearts:   ['hearts',   'spades',   'diamonds', 'clubs'],    // R B R B
  diamonds: ['diamonds', 'clubs',    'hearts',   'spades'],   // R B R B
  notrump:  ['spades',   'hearts',   'clubs',    'diamonds'], // B R B R
};

export default function DummyHand({ cards, position, onPlay, canPlay = false, trumpSuit }: DummyHandProps) {
  const suits = SUIT_ORDER[trumpSuit ?? 'notrump'];
  const rankOrder = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

  const bySuit: Record<string, CardType[]> = { spades: [], hearts: [], clubs: [], diamonds: [] };
  for (const card of cards) bySuit[card.suit].push(card);
  for (const suit of suits) {
    bySuit[suit].sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));
  }

  return (
    <div className="flex gap-0.5 sm:gap-1">
      {suits.map(suit => (
        <div key={suit} className="flex flex-col items-center gap-0.5">
          <span className={`text-[10px] sm:text-xs font-bold ${suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-800'}`}>
            {SUIT_SYMBOLS[suit]}
          </span>
          <div className="flex flex-col">
            {bySuit[suit].map((card, i) => (
              <div key={`${card.suit}-${card.rank}`} className={i > 0 ? '-mt-[34px] sm:-mt-[46px] md:-mt-[66px] lg:-mt-[82px] xl:-mt-[98px]' : ''} style={{ zIndex: i + 1 }}>
                <Card
                  card={card}
                  size="lg"
                  playable={canPlay}
                  onClick={() => onPlay?.(card)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
