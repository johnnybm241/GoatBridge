import { motion, AnimatePresence } from 'framer-motion';
import type { Trick } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import Card from './Card.js';

interface TrickAreaProps {
  currentTrick: Trick | null;
}

const SEAT_POSITIONS: Record<Seat, { top: string; left: string; transform?: string }> = {
  north: { top: '5%', left: '50%', transform: 'translateX(-50%)' },
  south: { top: '65%', left: '50%', transform: 'translateX(-50%)' },
  east: { top: '35%', left: '70%' },
  west: { top: '35%', left: '15%' },
};

export default function TrickArea({ currentTrick }: TrickAreaProps) {
  if (!currentTrick || currentTrick.cards.length === 0) {
    return <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-20 h-20 rounded-full border-2 border-felt-light/30 flex items-center justify-center text-felt-light/30 text-xs text-center">
        Trick Area
      </div>
    </div>;
  }

  return (
    <div className="absolute inset-0">
      <AnimatePresence>
        {currentTrick.cards.map((tc) => {
          const pos = SEAT_POSITIONS[tc.seat];
          return (
            <motion.div
              key={`${tc.card.suit}-${tc.card.rank}-${tc.seat}`}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute"
              style={{ ...pos }}
            >
              <Card card={tc.card} size="md" />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
