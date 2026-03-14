import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';

interface ConventionCard {
  id: string;
  name: string;
  isDefault: boolean;
  updatedAt: number;
}

export default function ConventionsPage() {
  const [cards, setCards] = useState<ConventionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const load = () => {
    api.get<{ conventionCards: ConventionCard[] }>('/conventions')
      .then(r => setCards(r.data.conventionCards))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createCard = async () => {
    if (!newName.trim()) return;
    await api.post('/conventions', { name: newName.trim() });
    setNewName('');
    setCreating(false);
    load();
  };

  const setDefault = async (id: string) => {
    await api.post(`/conventions/${id}/default`);
    load();
  };

  const deleteCard = async (id: string) => {
    if (!confirm('Delete this convention card?')) return;
    await api.delete(`/conventions/${id}`);
    load();
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gold">Convention Cards</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-gold hover:bg-gold-light text-navy font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + New Card
        </button>
      </div>

      {creating && (
        <div className="bg-navy border border-gold/30 rounded-xl p-4 mb-4 flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Card name (e.g. SAYC Standard)"
            className="flex-1 bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
            autoFocus
          />
          <button onClick={createCard} className="bg-gold text-navy font-bold px-3 py-2 rounded-lg text-sm">Create</button>
          <button onClick={() => setCreating(false)} className="text-cream/50 hover:text-cream px-2">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-cream/50 text-sm">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="text-cream/50 text-center py-12">
          <div className="text-4xl mb-2">♠</div>
          <div>No convention cards yet.</div>
          <div className="text-sm mt-1">Create one to share your bidding system with partners.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <div key={card.id} className="bg-navy border border-gold/20 rounded-xl p-4 flex items-center gap-3">
              {card.isDefault && (
                <span className="text-gold text-xs border border-gold/40 rounded px-1.5 py-0.5">Default</span>
              )}
              <span className="flex-1 text-cream font-medium">{card.name}</span>
              <div className="flex gap-2 text-sm">
                <Link to={`/conventions/${card.id}`} className="text-blue-400 hover:text-blue-300">Edit</Link>
                {!card.isDefault && (
                  <button onClick={() => setDefault(card.id)} className="text-gold/60 hover:text-gold">Set Default</button>
                )}
                <button onClick={() => deleteCard(card.id)} className="text-red-400/60 hover:text-red-400">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
