import { useEffect, useState } from 'react';
import api from '../api.js';

interface Partnership {
  id: string;
  userAId: string;
  userBId: string;
  status: 'pending' | 'accepted';
  conventionCardId: string | null;
}

interface ConventionCard {
  id: string;
  name: string;
}

export default function PartnershipsPage() {
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [myCards, setMyCards] = useState<ConventionCard[]>([]);
  const [toUsername, setToUsername] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([
      api.get<{ partnerships: Partnership[] }>('/partnerships'),
      api.get<{ conventionCards: ConventionCard[] }>('/conventions'),
    ]).then(([p, c]) => {
      setPartnerships(p.data.partnerships);
      setMyCards(c.data.conventionCards);
    });
  };

  useEffect(() => { load(); }, []);

  const sendRequest = async () => {
    if (!toUsername.trim()) return;
    try {
      await api.post('/partnerships/request', { toUsername: toUsername.trim() });
      setToUsername('');
      setError('');
      load();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed');
    }
  };

  const accept = async (id: string) => {
    await api.post(`/partnerships/${id}/accept`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this partnership?')) return;
    await api.delete(`/partnerships/${id}`);
    load();
  };

  const assignCard = async (id: string, conventionCardId: string) => {
    await api.put(`/partnerships/${id}/card`, { conventionCardId: conventionCardId || null });
    load();
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gold mb-6">Partnerships</h1>

      {/* Send request */}
      <div className="bg-navy border border-gold/30 rounded-xl p-4 mb-6">
        <h2 className="text-gold text-sm font-bold mb-3">Invite a Partner</h2>
        <div className="flex gap-2">
          <input
            value={toUsername}
            onChange={e => setToUsername(e.target.value)}
            placeholder="Username"
            className="flex-1 bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
          />
          <button onClick={sendRequest} className="bg-gold text-navy font-bold px-4 py-2 rounded-lg text-sm">
            Send
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      {/* Partnership list */}
      <div className="space-y-3">
        {partnerships.length === 0 && (
          <div className="text-cream/50 text-center py-8">
            <div className="text-3xl mb-2">🤝</div>
            <div>No partnerships yet.</div>
          </div>
        )}
        {partnerships.map(p => (
          <div key={p.id} className="bg-navy border border-gold/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-cream font-medium text-sm">
                Partnership #{p.id.slice(0, 8)}
                {p.status === 'pending' && <span className="ml-2 text-yellow-400 text-xs">Pending</span>}
              </div>
              <div className="flex gap-2">
                {p.status === 'pending' && (
                  <button onClick={() => accept(p.id)} className="text-green-400 text-xs hover:text-green-300">
                    Accept
                  </button>
                )}
                <button onClick={() => remove(p.id)} className="text-red-400/60 hover:text-red-400 text-xs">
                  Remove
                </button>
              </div>
            </div>
            {p.status === 'accepted' && (
              <div className="flex items-center gap-2">
                <span className="text-cream/60 text-xs">Convention card:</span>
                <select
                  value={p.conventionCardId ?? ''}
                  onChange={e => assignCard(p.id, e.target.value)}
                  className="bg-navy border border-gold/20 text-cream text-xs rounded px-2 py-1 focus:outline-none"
                >
                  <option value="">None</option>
                  {myCards.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
