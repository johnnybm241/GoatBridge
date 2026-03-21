import type { BiddingState, BidCall, Vulnerability } from '@goatbridge/shared';
import { SUIT_SYMBOLS } from '@goatbridge/shared';
import type { Seat } from '@goatbridge/shared';

interface AuctionHistoryProps {
  bidding: BiddingState;
  dealer: Seat;
  vulnerability: Vulnerability;
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

// Column order: E S W N
const COLUMN_SEATS: Seat[] = ['east', 'south', 'west', 'north'];
const COLUMN_LABELS = ['E', 'S', 'W', 'N'];

function isVul(seat: Seat, vulnerability: Vulnerability): boolean {
  if (vulnerability === 'both') return true;
  if (vulnerability === 'ns') return seat === 'north' || seat === 'south';
  if (vulnerability === 'ew') return seat === 'east' || seat === 'west';
  return false;
}

export default function AuctionHistory({ bidding, dealer, vulnerability }: AuctionHistoryProps) {
  const dealerCol = COLUMN_SEATS.indexOf(dealer);

  // Build rows: pad the start so dealer lands in their column
  const cells: Array<{ call: BidCall; seat: Seat } | null> = [];
  for (let i = 0; i < dealerCol; i++) cells.push(null);
  for (const c of bidding.calls) cells.push(c);

  const rows: Array<Array<{ call: BidCall; seat: Seat } | null>> = [];
  for (let i = 0; i < cells.length; i += 4) {
    rows.push(cells.slice(i, i + 4));
  }

  return (
    <div className="bg-navy/80 border border-gold/20 rounded-lg p-5 min-w-[220px]">
      <div className="text-gold text-lg font-bold text-center mb-3">Auction</div>
      <table className="w-full table-fixed text-center text-lg">
        <thead>
          <tr>
            {COLUMN_LABELS.map((h, ci) => (
              <th key={h} className={`font-bold w-1/4 pb-2 text-lg ${isVul(COLUMN_SEATS[ci]!, vulnerability) ? 'text-red-500' : 'text-cream/50'}`}>
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
                  <td key={ci} className="py-2 px-4 text-cream/90">
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
