import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 nav-blur border-b border-border`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="font-mono font-bold text-lg text-primary tracking-tight">
          ArbOS
        </Link>
        {isLanding && (
          <Link
            to="/connect"
            className="font-mono text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Get Started →
          </Link>
        )}
      </div>
    </nav>
  );
}
