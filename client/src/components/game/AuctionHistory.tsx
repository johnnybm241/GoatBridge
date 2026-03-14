import type { BiddingState, BidCall } from '@goatbridge/shared';
import { SUIT_SYMBOLS } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';
import { SEATS } from '@goatbridge/shared';

interface AuctionHistoryProps {
  bidding: BiddingState;
  dealer: Seat;
}

function formatCall(call: BidCall): React.ReactNode {
  if (call.type === 'pass') return <span className="text-green-400">Pass</span>;
  if (call.type === 'double') return <span className="text-red-400">Dbl</span>;
  if (call.type === 'redouble') return <span className="text-blue-400">Rdbl</span>;

  const { level, strain } = call;
  const isRed = strain === 'hearts' || strain === 'diamonds';
  const symbol = strain === 'notrump' ? 'NT' : SUIT_SYMBOLS[strain];

  return (
    <span>
      {level}
      <span className={isRed ? 'text-red-500' : strain === 'notrump' ? 'text-blue-400' : 'text-cream'}>
        {symbol}
      </span>
    </span>
  );
}

export default function AuctionHistory({ bidding, dealer }: AuctionHistoryProps) {
  const dealerIdx = SEATS.indexOf(dealer);
  const headers = ['N', 'E', 'S', 'W'];

  // Build rows: pad the start based on dealer position
  const cells: Array<{ call: BidCall; seat: Seat } | null> = [];
  for (let i = 0; i < dealerIdx; i++) cells.push(null); // padding
  for (const c of bidding.calls) cells.push(c);

  const rows: Array<Array<{ call: BidCall; seat: Seat } | null>> = [];
  for (let i = 0; i < cells.length; i += 4) {
    rows.push(cells.slice(i, i + 4));
  }

  return (
    <div className="bg-navy/80 border border-gold/20 rounded-lg p-2">
      <div className="text-gold text-xs font-bold text-center mb-1">Auction</div>
      <table className="w-full text-center text-xs">
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} className={`text-cream/50 font-normal w-1/4 pb-1 ${SEATS[(dealerIdx + ['N','E','S','W'].indexOf(h)) % 4] === dealer ? 'text-gold font-bold' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {[0,1,2,3].map(ci => {
                const cell = row[ci];
                return (
                  <td key={ci} className="py-0.5 text-cream/90">
                    {cell ? formatCall(cell.call) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
