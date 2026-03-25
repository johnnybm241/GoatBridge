import { useEffect, useState, useRef } from 'react';
import api from '../api.js';
import { useAuthStore } from '../store/authStore.js';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  goat_balance: number;
  bleats: number;
  hands_played: number;
  is_admin: number;
  can_create_tournament: number;
  is_banned: number;
  created_at: number;
}

export default function AdminPage() {
  const isAdmin = useAuthStore(s => s.isAdmin);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = (q: string) => {
    setLoading(true);
    setError('');
    const url = q.trim() ? `/admin/users?q=${encodeURIComponent(q.trim())}` : '/admin/users';
    api.get<{ users: AdminUser[] }>(url)
      .then(res => setUsers(res.data.users))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) fetchUsers('');
  }, [isAdmin]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUsers(val), 300);
  };

  const toggleRole = async (
    userId: string,
    field: 'isAdmin' | 'canCreateTournament' | 'isBanned',
    current: boolean,
    username: string,
  ) => {
    // Safety confirmation for banning
    if (field === 'isBanned' && !current) {
      if (!window.confirm(`Ban ${username}? They won't be able to join tournaments.`)) return;
    }
    try {
      const res = await api.patch<{
        user: { id: string; username: string; isAdmin: boolean; canCreateTournament: boolean; isBanned: boolean };
      }>(`/admin/users/${userId}/roles`, { [field]: !current });
      setUsers(prev => prev.map(u => u.id === userId ? {
        ...u,
        is_admin: res.data.user.isAdmin ? 1 : 0,
        can_create_tournament: res.data.user.canCreateTournament ? 1 : 0,
        is_banned: res.data.user.isBanned ? 1 : 0,
      } : u));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to update role');
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-navy border border-red-500/30 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <h1 className="text-xl font-bold text-red-400 mb-2">Access Denied</h1>
          <p className="text-cream/60 text-sm">Only admins can see this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🛡️</span>
        <h1 className="text-2xl font-bold text-gold">Admin Panel</h1>
      </div>

      {/* Search */}
      <div className="bg-navy border border-gold/30 rounded-xl p-4 mb-6">
        <label className="block text-cream/80 text-sm mb-2">Search Users</label>
        <input
          type="text"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search by username…"
          className="w-full max-w-sm bg-navy border border-gold/30 text-cream rounded-lg px-3 py-2 focus:outline-none focus:border-gold transition-colors text-sm"
        />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Users table */}
      <div className="bg-navy border border-gold/30 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gold/20 bg-white/5">
                <th className="text-left px-4 py-3 text-gold font-semibold">Username</th>
                <th className="text-right px-4 py-3 text-gold font-semibold">Bleats</th>
                <th className="text-right px-4 py-3 text-gold font-semibold">Boards</th>
                <th className="text-center px-4 py-3 text-gold font-semibold">Admin</th>
                <th className="text-center px-4 py-3 text-gold font-semibold">Tournament Organizer</th>
                <th className="text-center px-4 py-3 text-gold font-semibold">Ban</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-cream/40">Loading…</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-cream/40">No users found</td>
                </tr>
              ) : users.map((user, i) => (
                <tr
                  key={user.id}
                  className={`border-b border-gold/10 transition-colors ${
                    user.is_banned ? 'opacity-60 bg-red-900/10' : i % 2 === 0 ? '' : 'bg-white/2'
                  } hover:bg-white/5`}
                >
                  <td className="px-4 py-3 text-cream font-medium">
                    {user.username}
                    {!!user.is_banned && <span className="ml-2 text-red-400 text-xs">(banned)</span>}
                  </td>
                  <td className="px-4 py-3 text-cream/70 text-right">{user.bleats.toLocaleString()}</td>
                  <td className="px-4 py-3 text-cream/70 text-right">{user.hands_played.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleRole(user.id, 'isAdmin', !!user.is_admin, user.username)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        user.is_admin
                          ? 'bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30'
                          : 'bg-white/5 text-cream/40 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {user.is_admin ? '✓ Admin' : 'Off'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleRole(user.id, 'canCreateTournament', !!user.can_create_tournament, user.username)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        user.can_create_tournament
                          ? 'bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30'
                          : 'bg-white/5 text-cream/40 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {user.can_create_tournament ? '✓ Enabled' : 'Off'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleRole(user.id, 'isBanned', !!user.is_banned, user.username)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        user.is_banned
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                          : 'bg-white/5 text-cream/40 border border-white/10 hover:bg-white/10 hover:text-red-400/60'
                      }`}
                    >
                      {user.is_banned ? '🚫 Banned' : 'Ban'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
