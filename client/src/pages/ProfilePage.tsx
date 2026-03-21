import { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuthStore } from '../store/authStore.js';
import { getRank, getNextRank, getRankProgress, GOAT_RANKS } from '@goatbridge/shared';

interface Transaction {
  id: string;
  amount: number;
  reason: string;
  createdAt: number;
}

export default function ProfilePage() {
  const auth = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ balance: number }>('/goats/balance'),
      api.get<{ transactions: Transaction[] }>('/goats/transactions'),
      api.get<{ handsPlayed: number; skillPoints: number; bleats: number; isAdmin: boolean; canCreateTournament: boolean }>('/auth/me'),
    ]).then(([bal, txns, me]) => {
      auth.setGoatBalance(bal.data.balance);
      auth.setSkillPoints(me.data.skillPoints);
      auth.setHandsPlayed(me.data.handsPlayed);
      auth.setBleats(me.data.bleats ?? 0);
      auth.setIsAdmin(me.data.isAdmin ?? false);
      auth.setCanCreateTournament(me.data.canCreateTournament ?? false);
      setTransactions(txns.data.transactions);
    }).finally(() => setLoading(false));
  }, []);

  const bleats = auth.bleats;
  const rank = getRank(bleats);
  const nextRank = getNextRank(bleats);
  const progress = getRankProgress(bleats);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gold mb-6">Profile</h1>

      {/* Player card */}
      <div className="bg-navy border border-gold/30 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div
            className="w-16 h-16 rounded-full bg-felt flex items-center justify-center text-3xl shrink-0"
          >
            {rank.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold text-cream">{auth.username}</div>
            <div className="font-bold text-lg" style={{ color: rank.color }}>{rank.name}</div>
            <div className="text-cream/60 text-sm">{auth.handsPlayed} boards played</div>

            {/* Bleats + progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold" style={{ color: rank.color }}>
                  {bleats.toLocaleString()} Bleats
                </span>
                {nextRank ? (
                  <span className="text-cream/50">
                    {nextRank.minBleats.toLocaleString()} for {nextRank.name}
                  </span>
                ) : (
                  <span className="text-gold/80">Max rank!</span>
                )}
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(progress * 100).toFixed(1)}%`, backgroundColor: rank.color }}
                />
              </div>
            </div>

            <div className="flex gap-4 mt-3 text-sm">
              <span className="text-gold font-semibold">🐐 {auth.goatBalance.toLocaleString()} Goats</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rank ladder */}
      <div className="bg-navy border border-gold/30 rounded-xl p-6 mb-6">
        <h2 className="text-gold font-bold mb-4">Rank Ladder</h2>
        <div className="space-y-2">
          {GOAT_RANKS.map(r => {
            const isCurrent = r.id === rank.id;
            const isUnlocked = bleats >= r.minBleats;
            return (
              <div
                key={r.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  isCurrent ? 'border border-current/40 bg-white/5' : ''
                } ${!isUnlocked ? 'opacity-40' : ''}`}
                style={{ color: r.color }}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <span>{r.icon}</span>
                  <span>{r.name}</span>
                  {isCurrent && <span className="text-xs bg-current/20 rounded px-1.5 py-0.5 text-current">Current</span>}
                </span>
                <span className="text-cream/50 text-xs">{r.minBleats.toLocaleString()} Bleats</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transaction history */}
      <div className="bg-navy border border-gold/30 rounded-xl p-6">
        <h2 className="text-gold font-bold mb-4">Goat Transaction History</h2>
        {loading ? (
          <div className="text-cream/50 text-sm">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="text-cream/50 text-sm">No transactions yet. Play some hands!</div>
        ) : (
          <div className="space-y-2">
            {transactions.map(txn => (
              <div key={txn.id} className="flex justify-between text-sm border-b border-gold/10 pb-1">
                <span className="text-cream/70 capitalize">{txn.reason.replace(/_/g, ' ')}</span>
                <span className={txn.amount > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                  {txn.amount > 0 ? '+' : ''}{txn.amount} 🐐
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
