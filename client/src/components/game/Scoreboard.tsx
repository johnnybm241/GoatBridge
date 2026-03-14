import type { RubberScore, Vulnerability } from '@goatbridge/shared';

interface ScoreboardProps {
  scores: RubberScore;
  vulnerability: Vulnerability;
}

export default function Scoreboard({ scores, vulnerability }: ScoreboardProps) {
  const nsVul = vulnerability === 'ns' || vulnerability === 'both';
  const ewVul = vulnerability === 'ew' || vulnerability === 'both';

  return (
    <div className="bg-cream text-gray-900 rounded-lg p-3 min-w-[180px] shadow-xl text-sm font-serif">
      <div className="text-center font-bold text-navy border-b-2 border-gray-900 pb-1 mb-2">
        Bridge Score
      </div>

      {/* Headers */}
      <div className="grid grid-cols-2 text-center font-bold border-b border-gray-400 pb-1 mb-1">
        <div className={nsVul ? 'text-red-700 font-extrabold' : ''}>
          We (N/S) {nsVul ? '♦' : ''}
        </div>
        <div className={ewVul ? 'text-red-700 font-extrabold' : ''}>
          They (E/W) {ewVul ? '♦' : ''}
        </div>
      </div>

      {/* Above the line */}
      <div className="space-y-0.5 min-h-[40px] mb-2 text-center text-xs text-gray-600">
        {scores.nsAboveTotal > 0 && <div>{scores.nsAboveTotal}</div>}
        {scores.ewAboveTotal > 0 && <div className="text-right">{scores.ewAboveTotal}</div>}
      </div>

      {/* The line */}
      <div className="border-t-2 border-gray-900 my-1" />

      {/* Below the line */}
      <div className="grid grid-cols-2 gap-1 text-center min-h-[40px]">
        <div>
          <div className="font-bold text-navy text-base">{scores.nsBelowPartial > 0 ? scores.nsBelowPartial : ''}</div>
          {scores.nsGamesWon > 0 && (
            <div className="flex justify-center gap-1">
              {Array.from({ length: scores.nsGamesWon }).map((_, i) => (
                <span key={i} className="text-gold text-lg">★</span>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="font-bold text-navy text-base">{scores.ewBelowPartial > 0 ? scores.ewBelowPartial : ''}</div>
          {scores.ewGamesWon > 0 && (
            <div className="flex justify-center gap-1">
              {Array.from({ length: scores.ewGamesWon }).map((_, i) => (
                <span key={i} className="text-gold text-lg">★</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {scores.isComplete && (
        <div className="mt-2 border-t border-gray-400 pt-2 text-center font-bold text-navy">
          <div>Final Score</div>
          <div className="grid grid-cols-2 text-lg">
            <div>{scores.finalNsScore}</div>
            <div>{scores.finalEwScore}</div>
          </div>
          <div className="text-gold font-bold">
            {scores.winner === 'ns' ? 'N/S win! 🐐' : 'E/W win! 🐐'}
          </div>
        </div>
      )}
    </div>
  );
}
