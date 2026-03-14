import { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuthStore } from '../store/authStore.js';

interface SkinItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  previewUrl: string;
  unlockType: 'default' | 'progress' | 'purchase';
  unlockThreshold: number | null;
  goatCost: number | null;
  owned: boolean;
  unlocked: boolean;
}

export default function ShopPage() {
  const auth = useAuthStore();
  const [skins, setSkins] = useState<SkinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    api.get<{ skins: SkinItem[] }>('/skins').then(r => {
      setSkins(r.data.skins);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const equip = async (slug: string) => {
    await api.post(`/skins/${slug}/equip`);
    auth.setSkin(slug);
    setError('');
  };

  const buy = async (slug: string) => {
    try {
      await api.post(`/skins/${slug}/buy`);
      const bal = await api.get<{ balance: number }>('/goats/balance');
      auth.setGoatBalance(bal.data.balance);
      load();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Purchase failed');
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gold">Card Back Skins</h1>
        <div className="text-gold font-bold">🐐 {auth.goatBalance.toLocaleString()}</div>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="text-cream/50">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {skins.map(skin => (
            <div key={skin.id} className={`
              bg-navy border rounded-xl p-4 flex flex-col items-center gap-3
              ${auth.activeCardBackSkin === skin.slug ? 'border-gold' : 'border-gold/20'}
            `}>
              {/* Preview */}
              <div className={`w-16 h-24 rounded-lg card-shadow border-2 flex items-center justify-center text-2xl
                ${skin.slug === 'classic' ? 'bg-blue-900 border-blue-700' :
                  skin.slug === 'ocean' ? 'bg-cyan-900 border-cyan-700' :
                  skin.slug === 'midnight' ? 'bg-indigo-950 border-indigo-700' :
                  'bg-yellow-900 border-yellow-600'}
              `}>
                ✦
              </div>

              <div className="text-center">
                <div className="text-cream font-bold text-sm">{skin.name}</div>
                <div className="text-cream/50 text-xs">{skin.description}</div>
              </div>

              {/* Status / action */}
              {auth.activeCardBackSkin === skin.slug ? (
                <span className="text-gold text-xs font-bold">✓ Equipped</span>
              ) : skin.unlocked ? (
                <button
                  onClick={() => equip(skin.slug)}
                  className="text-xs bg-felt hover:bg-felt-light text-cream px-3 py-1 rounded border border-felt-light transition-colors"
                >
                  Equip
                </button>
              ) : skin.unlockType === 'progress' ? (
                <div className="text-cream/40 text-xs text-center">
                  🔒 Play {skin.unlockThreshold} hands
                </div>
              ) : skin.goatCost != null ? (
                <button
                  onClick={() => buy(skin.slug)}
                  className="text-xs bg-gold hover:bg-gold-light text-navy font-bold px-3 py-1 rounded transition-colors"
                >
                  Buy {skin.goatCost} 🐐
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
