import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { VolunteerDashboard } from './pages/VolunteerDashboard.js';
import { FanPortal } from './pages/FanPortal.js';
import './index.css';


function Header({ view: _view }: { view: 'volunteer' | 'fan' }) {
  return (
    <header className="header" role="banner">
      <a href="/" className="header__logo" aria-label="SoFi Stadium Copilot home">
        <span className="header__logo-icon" aria-hidden="true">⚽</span>
        SoFi Copilot
        <span className="header__badge">FIFA WC 2026</span>
      </a>
      <nav role="navigation" aria-label="Main navigation">
        <div style={{ display: 'flex', gap: 'var(--space-1)', background: 'var(--bg-surface-2)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <NavLink
            to="/volunteer"
            className={({ isActive }) => `btn ${isActive ? 'btn--primary' : 'btn--ghost'} btn--sm`}
            aria-label="Volunteer dashboard"
            id="nav-volunteer"
          >
            🎽 Volunteer
          </NavLink>
          <NavLink
            to="/fan"
            className={({ isActive }) => `btn ${isActive ? 'btn--primary' : 'btn--ghost'} btn--sm`}
            aria-label="Fan assistant portal"
            id="nav-fan"
          >
            🎉 Fan Portal
          </NavLink>
        </div>
      </nav>
    </header>
  );
}

function AppContent() {
  const location = useLocation();
  const view: 'volunteer' | 'fan' = location.pathname.startsWith('/fan') ? 'fan' : 'volunteer';

  return (
    <div className={`app-root view-${view}`}>
      <Header view={view} />
      <main id="main-content" tabIndex={-1} style={{ outline: 'none' }}>
        <Routes>
          <Route path="/" element={<VolunteerDashboard />} />
          <Route path="/volunteer" element={<VolunteerDashboard />} />
          <Route path="/fan" element={<FanPortal />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
