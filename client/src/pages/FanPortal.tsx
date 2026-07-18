import { useState } from 'react';
import { FanAssistant } from '../components/FanAssistant.js';
import { api } from '../api/client.js';

const VENUE_HIGHLIGHTS = [
  { icon: '🏟️', label: 'SoFi Stadium', sub: 'Inglewood, CA' },
  { icon: '⚽', label: 'FIFA World Cup 2026', sub: 'Group Stage' },
  { icon: '👥', label: '70,240', sub: 'Capacity' },
  { icon: '♿', label: 'Fully Accessible', sub: 'All levels' },
];

export function FanPortal() {
  const [needType, setNeedType] = useState('none');
  const [escortSubmitted, setEscortSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleEscortRequest = async () => {
    if (needType === 'none' || submitting) return;
    setSubmitting(true);
    try {
      await api.createEscort({
        fanId: `fan-${Date.now()}`,
        currentZone: 'concourse-north',
        destinationZone: 'accessibility-hub',
        needType,
      });
      setEscortSubmitted(true);
    } catch {
      // Error handled gracefully
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page gradient-hero view-fan" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Hero */}
      <header style={{ textAlign: 'center', marginBottom: 'var(--space-10)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', fontWeight: 900, lineHeight: 1.1, marginBottom: 'var(--space-3)', background: 'linear-gradient(135deg, #ffffff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Fan Assistant
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-lg)' }}>
          Your personal guide to SoFi Stadium — FIFA World Cup 2026
        </p>
      </header>

      {/* Venue info strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
        {VENUE_HIGHLIGHTS.map(h => (
          <div key={h.label} className="card" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: 4 }}>{h.icon}</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>{h.label}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{h.sub}</div>
          </div>
        ))}
      </div>

      {/* Escort request banner */}
      {needType !== 'none' && !escortSubmitted && (
        <div className="card card--elevated" style={{ marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Accessibility escort requested</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>A volunteer will be sent to assist you.</p>
          </div>
          <button
            className="btn btn--primary"
            onClick={handleEscortRequest}
            disabled={submitting}
            id="request-escort-btn"
            aria-label="Request accessibility escort"
          >
            {submitting ? 'Requesting…' : '🙋 Request Escort'}
          </button>
        </div>
      )}

      {escortSubmitted && (
        <div className="card" style={{ marginBottom: 'var(--space-6)', borderColor: 'var(--success)', background: 'rgba(34,197,94,0.06)' }}>
          <p style={{ color: 'var(--color-green-400)', fontWeight: 600 }}>✅ Escort requested! A volunteer is on their way.</p>
        </div>
      )}

      {/* Main assistant */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <FanAssistant needType={needType} onNeedChange={setNeedType} />
      </div>

      {/* Accessibility notice */}
      <footer style={{ marginTop: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
        <p>Accessibility services available at the Accessibility Hub (Level 1, Centre). Call +1 (310) 555-0100 for immediate assistance.</p>
        <p style={{ marginTop: 4 }}>🔒 Your data is not stored. Conversations are not recorded.</p>
      </footer>
    </div>
  );
}
