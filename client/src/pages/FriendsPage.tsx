import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { useFriendsStore } from '../store/friendsStore.js';
import type { FriendSummary, FriendRequestSummary } from '@goatbridge/shared';

interface SearchResult {
  userId: string;
  username: string;
  bleats: number;
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestSummary[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestSummary[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const setPendingRequestCount = useFriendsStore(s => s.setPendingRequestCount);

  const load = useCallback(() => {
    Promise.all([
      api.get<{ friends: FriendSummary[] }>('/friends'),
      api.get<{ incoming: FriendRequestSummary[]; outgoing: FriendRequestSummary[] }>('/friends/requests'),
    ]).then(([f, r]) => {
      setFriends(f.data.friends);
      setIncoming(r.data.incoming);
      setOutgoing(r.data.outgoing);
      setPendingRequestCount(r.data.incoming.length);
    }).finally(() => setLoading(false));
  }, [setPendingRequestCount]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const timer = setTimeout(() => {
      api.get<{ users: SearchResult[] }>('/friends/search', { params: { q } })
        .then(r => setResults(r.data.users))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const sendRequest = (username: string) => {
    setError('');
    api.post('/friends/request', { username })
      .then(() => { setQuery(''); setResults([]); load(); })
      .catch(err => setError(err.response?.data?.error ?? 'Failed to send request'));
  };

  const acceptRequest = (id: string) => {
    api.post(`/friends/${id}/accept`).then(load);
  };

  const declineRequest = (id: string) => {
    api.post(`/friends/${id}/decline`).then(load);
  };

  const cancelRequest = (id: string) => {
    api.delete(`/friends/requests/${id}`).then(load);
  };

  const removeFriend = (userId: string) => {
    api.delete(`/friends/${userId}`).then(load);
  };

  const presenceLabel = (f: FriendSummary) => {
    if (!f.presence) return <span className="text-cream/40">Not at a table</span>;
    const what = f.presence.isSpectator ? 'Spectating' : `Playing (${f.presence.seat})`;
    return (
      <span className="text-green-400">
        {what} · Table <span className="font-mono">{f.presence.roomCode}</span>
      </span>
    );
  };

  if (loading) return <div className="max-w-3xl mx-auto p-6 text-cream/50">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gold mb-6">Friends</h1>

      {/* Search / add */}
      <div className="bg-navy border border-gold/30 rounded-xl p-6 mb-6">
        <h2 className="text-gold font-bold mb-3">Find Players</h2>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by username…"
          className="w-full bg-felt border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors"
        />
        {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
        {results.length > 0 && (
          <div className="mt-3 space-y-2">
            {results.map(u => (
              <div key={u.userId} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                <Link to={`/players/${encodeURIComponent(u.username)}`} className="text-cream hover:text-gold transition-colors">
                  {u.username}
                </Link>
                <button
                  onClick={() => sendRequest(u.username)}
                  className="bg-gold text-navy font-semibold text-xs px-3 py-1 rounded-lg hover:bg-gold/90 transition-colors"
                >
                  Add Friend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div className="bg-navy border border-gold/30 rounded-xl p-6 mb-6">
          <h2 className="text-gold font-bold mb-3">Friend Requests</h2>
          <div className="space-y-2">
            {incoming.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                <Link to={`/players/${encodeURIComponent(r.username)}`} className="text-cream hover:text-gold transition-colors">
                  {r.username}
                </Link>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptRequest(r.id)}
                    className="bg-green-600 text-white text-xs px-3 py-1 rounded-lg hover:bg-green-500 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineRequest(r.id)}
                    className="bg-white/10 text-cream/70 text-xs px-3 py-1 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing requests */}
      {outgoing.length > 0 && (
        <div className="bg-navy border border-gold/30 rounded-xl p-6 mb-6">
          <h2 className="text-gold font-bold mb-3">Sent Requests</h2>
          <div className="space-y-2">
            {outgoing.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                <Link to={`/players/${encodeURIComponent(r.username)}`} className="text-cream hover:text-gold transition-colors">
                  {r.username}
                </Link>
                <button
                  onClick={() => cancelRequest(r.id)}
                  className="bg-white/10 text-cream/70 text-xs px-3 py-1 rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div className="bg-navy border border-gold/30 rounded-xl p-6">
        <h2 className="text-gold font-bold mb-3">Your Friends ({friends.length})</h2>
        {friends.length === 0 ? (
          <div className="text-cream/50 text-sm">No friends yet. Search above to add some!</div>
        ) : (
          <div className="space-y-2">
            {friends.map(f => (
              <div key={f.userId} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                <div>
                  <Link to={`/players/${encodeURIComponent(f.username)}`} className="text-cream hover:text-gold transition-colors font-semibold">
                    {f.username}
                  </Link>
                  <div className="text-xs mt-0.5">{presenceLabel(f)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/players/${encodeURIComponent(f.username)}`}
                    className="bg-white/10 text-cream/70 text-xs px-3 py-1 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => removeFriend(f.userId)}
                    className="text-cream/40 hover:text-red-400 text-xs transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
