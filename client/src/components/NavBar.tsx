import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthStore } from '../store/authStore.js';
import { useSocketEvents } from '../hooks/useSocket.js';
import { APP_VERSION } from '../version.js';
import { getRank } from '@goatbridge/shared';

export default function NavBar() {
  const { username, goatBalance, logout } = useAuth();
  const bleats = useAuthStore(s => s.bleats);
  const isAdmin = useAuthStore(s => s.isAdmin);
  const rank = getRank(bleats);
  useSocketEvents();

  return (
    <nav className="bg-navy border-b border-gold/30 px-4 py-2 flex items-center justify-between z-50 relative">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-1.5 leading-tight">
          <span className="text-3xl">🐐</span>
          <span className="flex flex-col">
            <span className="text-gold font-bold text-xl tracking-wide">GoatBridge</span>
            <span className="text-cream/30 text-xs">v{APP_VERSION}</span>
          </span>
        </Link>
        <Link to="/" className="text-cream/80 hover:text-cream text-sm transition-colors">Lobby</Link>
        <Link to="/conventions" className="hidden md:inline text-cream/80 hover:text-cream text-sm transition-colors">Conventions</Link>
        <Link to="/partnerships" className="hidden md:inline text-cream/80 hover:text-cream text-sm transition-colors">Partners</Link>
        <Link to="/team-matches" className="hidden sm:inline text-cream/80 hover:text-cream text-sm transition-colors">Teams</Link>
        <Link to="/tournaments" className="hidden sm:inline text-cream/80 hover:text-cream text-sm transition-colors">Tournaments</Link>
        <Link to="/history" className="hidden sm:inline text-cream/80 hover:text-cream text-sm transition-colors">History</Link>
        <Link to="/shop" className="hidden sm:inline text-cream/80 hover:text-cream text-sm transition-colors">Shop</Link>
        {isAdmin && (
          <Link to="/admin" className="hidden sm:inline text-gold/70 hover:text-gold text-sm transition-colors font-semibold">
            Admin
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Link
          to="/profile"
          className="hidden sm:flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ color: rank.color }}
          title={`${rank.name} — ${bleats.toLocaleString()} Bleats`}
        >
          <span>{rank.icon}</span>
          <span className="hidden md:inline">{rank.name}</span>
          <span className="text-cream/60 font-normal">{bleats.toLocaleString()}</span>
        </Link>
        <span className="text-gold font-semibold text-sm">
          🐐 {goatBalance.toLocaleString()}
        </span>
        <Link to="/profile" className="text-cream/80 hover:text-cream text-sm transition-colors">
          {username}
        </Link>
        <button
          onClick={logout}
          className="text-cream/50 hover:text-cream text-sm transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
