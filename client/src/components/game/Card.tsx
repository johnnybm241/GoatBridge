import type { Card as CardType } from '@goatbridge/shared';
import { SUIT_SYMBOLS } from '@goatbridge/shared';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  playable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  skin?: string;
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-10 h-14 md:w-12 md:h-16 lg:w-14 lg:h-20 text-xs',
  md: 'w-12 h-16 md:w-16 md:h-24 lg:w-20 lg:h-28 text-xs md:text-sm',
  lg: 'w-10 h-14 sm:w-12 sm:h-[4.5rem] md:w-16 md:h-24 lg:w-20 lg:h-28 xl:w-24 xl:h-32 text-xs md:text-sm lg:text-base',
};

const CORNER_SUIT_SIZE = {
  sm: 'text-xs',
  md: 'text-xs md:text-sm',
  lg: 'text-xs sm:text-xs md:text-sm lg:text-base xl:text-lg',
};

const SUIT_COLORS = {
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
  clubs: 'text-gray-900',
  spades: 'text-gray-900',
};

export default function Card({ card, onClick, playable = false, size = 'md', faceDown = false, className = '' }: CardProps) {
  const sizeClass = SIZE_CLASSES[size];
  const cornerSuitSize = CORNER_SUIT_SIZE[size];
  const suitColor = SUIT_COLORS[card.suit];
  const symbol = SUIT_SYMBOLS[card.suit];

  if (faceDown) {
    return (
      <div className={`${sizeClass} rounded-lg card-shadow bg-navy border-2 border-blue-800 flex items-center justify-center ${className}`}>
        <div className="w-3/4 h-3/4 rounded border border-blue-600 opacity-60 flex items-center justify-center text-blue-400 text-xl">
          ✦
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={playable ? onClick : undefined}
      className={`
        ${sizeClass} rounded-lg card-shadow bg-cream border border-gray-200
        flex flex-col justify-between p-1 select-none
        ${playable
          ? 'cursor-pointer hover:-translate-y-2 active:scale-95 transition-transform duration-150 hover:ring-2 hover:ring-gold'
          : ''}
        ${className}
      `}
    >
      <div className={`${suitColor} font-bold leading-none text-left`}>
        <div>{card.rank}</div>
        <div className={cornerSuitSize}>{symbol}</div>
      </div>
      <div className={`${suitColor} text-center text-xs sm:text-sm md:text-base lg:text-lg leading-none`}>{symbol}</div>
    </div>
  );
}
