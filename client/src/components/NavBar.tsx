import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthStore } from '../store/authStore.js';

export default function NavBar() {
  const { username, goatBalance, logout } = useAuth();

  return (
    <nav className="bg-navy border-b border-gold/30 px-4 py-2 flex items-center justify-between z-50 relative">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-gold font-bold text-xl tracking-wide">
          🐐 GoatBridge
        </Link>
        <Link to="/" className="text-cream/80 hover:text-cream text-sm transition-colors">Lobby</Link>
        <Link to="/conventions" className="text-cream/80 hover:text-cream text-sm transition-colors">Conventions</Link>
        <Link to="/partnerships" className="text-cream/80 hover:text-cream text-sm transition-colors">Partners</Link>
        <Link to="/shop" className="text-cream/80 hover:text-cream text-sm transition-colors">Shop</Link>
      </div>
      <div className="flex items-center gap-4">
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
