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

export default function DummyHand({ cards, onPlay, canPlay = false, trumpSuit }: DummyHandProps) {
  const suits = SUIT_ORDER[trumpSuit ?? 'notrump'];
  const rankOrder = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

  const bySuit: Record<string, CardType[]> = { spades: [], hearts: [], clubs: [], diamonds: [] };
  for (const card of cards) bySuit[card.suit].push(card);
  for (const suit of suits) {
    bySuit[suit].sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));
  }

  return (
    <div className="flex flex-col gap-1 sm:gap-1.5">
      {suits.map(suit => {
        const suitCards = bySuit[suit];
        const isRed = suit === 'hearts' || suit === 'diamonds';
        return (
          <div key={suit} className="flex items-center gap-1.5">
            <span
              className={`w-4 sm:w-5 text-sm sm:text-base font-bold shrink-0 text-center ${
                isRed ? 'text-red-500' : 'text-cream'
              }`}
            >
              {SUIT_SYMBOLS[suit]}
            </span>
            <div className="flex">
              {suitCards.length === 0 ? (
                <span className="text-cream/40 text-xs italic px-1">void</span>
              ) : (
                suitCards.map((card, i) => (
                  <div
                    key={`${card.suit}-${card.rank}`}
                    className={
                      i > 0
                        ? '-ml-7 sm:-ml-9 md:-ml-11 lg:-ml-[58px] xl:-ml-[68px]'
                        : ''
                    }
                    style={{ zIndex: i + 1 }}
                  >
                    <Card
                      card={card}
                      size="lg"
                      playable={canPlay}
                      onClick={() => onPlay?.(card)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
