import { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuthStore } from '../store/authStore.js';

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
    ]).then(([bal, txns]) => {
      auth.setGoatBalance(bal.data.balance);
      setTransactions(txns.data.transactions);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gold mb-6">Profile</h1>

      <div className="bg-navy border border-gold/30 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-felt flex items-center justify-center text-3xl">
            🐐
          </div>
          <div>
            <div className="text-xl font-bold text-cream">{auth.username}</div>
            <div className="text-gold font-bold text-lg">🐐 {auth.goatBalance.toLocaleString()} Goats</div>
          </div>
        </div>
      </div>

      <div className="bg-navy border border-gold/30 rounded-xl p-6">
        <h2 className="text-gold font-bold mb-4">Transaction History</h2>
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
