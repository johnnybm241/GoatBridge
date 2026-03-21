import { motion } from 'framer-motion';
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
  lg: 'w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-28 lg:w-24 lg:h-32 xl:w-28 xl:h-40 text-xs sm:text-sm md:text-base lg:text-lg',
};

const CORNER_SUIT_SIZE = {
  sm: 'text-xs',
  md: 'text-xs md:text-sm',
  lg: 'text-sm md:text-base lg:text-xl xl:text-2xl',
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
    <motion.div
      onClick={playable ? onClick : undefined}
      whileHover={playable ? { y: -8, transition: { duration: 0.15 } } : undefined}
      whileTap={playable ? { scale: 0.95 } : undefined}
      className={`
        ${sizeClass} rounded-lg card-shadow bg-cream border border-gray-200
        flex flex-col justify-between p-1 select-none
        ${playable ? 'cursor-pointer hover:ring-2 hover:ring-gold' : ''}
        ${className}
      `}
    >
      <div className={`${suitColor} font-bold leading-none text-left`}>
        <div>{card.rank}</div>
        <div className={cornerSuitSize}>{symbol}</div>
      </div>
      <div className={`${suitColor} text-center text-base md:text-xl leading-none`}>{symbol}</div>
    </motion.div>
  );
}
