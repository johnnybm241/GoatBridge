import type { Card as CardType, Seat } from '@goatbridge/shared';
import { SUIT_SYMBOLS } from '@goatbridge/shared';
import Card from './Card.js';

interface DummyHandProps {
  cards: CardType[];
  dummySeat: Seat;
  onPlay?: (card: CardType) => void;
  canPlay?: boolean;
}

export default function DummyHand({ cards, onPlay, canPlay = false }: DummyHandProps) {
  // Group by suit, sorted
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
  const rankOrder = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  const bySuit: Record<string, CardType[]> = { spades: [], hearts: [], diamonds: [], clubs: [] };
  for (const card of cards) bySuit[card.suit].push(card);
  for (const suit of suits) {
    bySuit[suit].sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));
  }

  return (
    <div className="flex gap-2">
      {suits.map(suit => (
        <div key={suit} className="flex flex-col items-center gap-1">
          <span className={`text-xs font-bold ${suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-800'}`}>
            {SUIT_SYMBOLS[suit]}
          </span>
          <div className="flex flex-col gap-0.5">
            {bySuit[suit].map(card => (
              <Card
                key={`${card.suit}-${card.rank}`}
                card={card}
                size="sm"
                playable={canPlay}
                onClick={() => onPlay?.(card)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
