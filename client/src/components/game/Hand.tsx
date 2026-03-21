import type { Card as CardType } from '@goatbridge/shared';
import Card from './Card.js';

interface HandProps {
  cards: CardType[];
  onPlay?: (card: CardType) => void;
  isYourTurn?: boolean;
  horizontal?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export default function Hand({ cards, onPlay, isYourTurn = false, size = 'md', label }: HandProps) {
  // Sort hand: spades, hearts, diamonds, clubs; within each suit high to low
  const suitOrder = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
  const rankOrder = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sorted = [...cards].sort((a, b) => {
    const suitDiff = suitOrder[a.suit] - suitOrder[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
  });

  const overlap = size === 'sm'
    ? '-ml-5 md:-ml-6 lg:-ml-8'
    : size === 'md'
    ? '-ml-7 md:-ml-9 lg:-ml-12'
    : '-ml-8 sm:-ml-10 md:-ml-12 lg:-ml-14 xl:-ml-16';

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <div className="text-cream/50 text-xs mb-1">{label}</div>}
      <div className="flex items-end">
        {sorted.map((card, i) => (
          <div
            key={`${card.suit}-${card.rank}`}
            className={i > 0 ? overlap : ''}
            style={{ zIndex: i }}
          >
            <Card
              card={card}
              size={size}
              playable={isYourTurn && !!onPlay}
              onClick={() => onPlay?.(card)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
