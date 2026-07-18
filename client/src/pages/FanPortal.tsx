import { useState } from 'react';
import { FanAssistant } from '../components/FanAssistant.js';
import { api } from '../api/client.js';

const VENUE_HIGHLIGHTS = [
  { icon: '🏟️', label: 'SoFi Stadium', sub: 'Inglewood, CA' },
  { icon: '⚽', label: 'FIFA World Cup 2026', sub: 'Group Stage' },
  { icon: '👥', label: '70,240', sub: 'Capacity' },
  { icon: '♿', label: 'Fully Accessible', sub: 'All levels' },
];

const ZONE_OPTIONS = [
  { id: 'gate-a', label: 'Gate A (North)' },
  { id: 'gate-b', label: 'Gate B (East)' },
  { id: 'gate-c', label: 'Gate C (South)' },
  { id: 'gate-d', label: 'Gate D (West)' },
  { id: 'concourse-north', label: 'North Concourse' },
  { id: 'concourse-east', label: 'East Concourse' },
  { id: 'concourse-south', label: 'South Concourse' },
  { id: 'concourse-west', label: 'West Concourse' },
  { id: 'section-100s', label: 'Sections 100–130 (Lower Bowl)' },
  { id: 'section-200s', label: 'Sections 200–240 (Upper Bowl)' },
  { id: 'medical-bay', label: 'Medical Bay (West Wing)' },
  { id: 'accessibility-hub', label: 'Accessibility Services Hub' },
  { id: 'food-court-north', label: 'North Food Court' },
  { id: 'restrooms-north', label: 'North Restroom Cluster' },
];

export function FanPortal() {
  const [needType, setNeedType] = useState('none');
  const [currentZone, setCurrentZone] = useState('concourse-north');
  const [destinationZone, setDestinationZone] = useState('accessibility-hub');
  const [escortSubmitted, setEscortSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [escortError, setEscortError] = useState<string | null>(null);

  const handleEscortRequest = async () => {
    if (needType === 'none' || submitting) return;
    setSubmitting(true);
    setEscortError(null);
    try {
      await api.createEscort({
        fanId: `fan-${Date.now()}`,
        currentZone,
        destinationZone,
        needType,
      });
      setEscortSubmitted(true);
    } catch (e) {
      setEscortError(e instanceof Error ? e.message : 'Failed to request escort. Please try again.');
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
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
        <div className="card card--elevated" style={{ marginBottom: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Accessibility escort requested</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Specify your locations below and a volunteer will be dispatched right away.</p>
            </div>
            <button
              className="btn btn--primary"
              onClick={handleEscortRequest}
              disabled={submitting || currentZone === destinationZone}
              id="request-escort-btn"
              aria-label="Request accessibility escort"
            >
              {submitting ? 'Requesting…' : '🙋 Request Escort'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)' }}>
            <div>
              <label htmlFor="current-zone-select" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Current Location:</label>
              <select
                id="current-zone-select"
                className="lang-select"
                style={{ width: '100%' }}
                value={currentZone}
                onChange={e => setCurrentZone(e.target.value)}
              >
                {ZONE_OPTIONS.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dest-zone-select" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Destination Zone:</label>
              <select
                id="dest-zone-select"
                className="lang-select"
                style={{ width: '100%' }}
                value={destinationZone}
                onChange={e => setDestinationZone(e.target.value)}
              >
                {ZONE_OPTIONS.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </div>
          </div>

          {currentZone === destinationZone && (
            <p style={{ color: 'var(--color-amber-400)', fontSize: 'var(--text-xs)', margin: 0 }}>⚠️ Current location and destination must be different.</p>
          )}

          {escortError && (
            <div role="alert" style={{ color: 'var(--color-rose-400)', fontSize: 'var(--text-sm)', background: 'rgba(244,63,94,0.1)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
              ❌ {escortError}
            </div>
          )}
        </div>
      )}

      {escortSubmitted && (
        <div className="card" style={{ marginBottom: 'var(--space-6)', borderColor: 'var(--success)', background: 'rgba(34,197,94,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <p style={{ color: 'var(--color-green-400)', fontWeight: 600, marginBottom: 4 }}>✅ Escort dispatched!</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: 0 }}>A volunteer is en route from {ZONE_OPTIONS.find(z => z.id === currentZone)?.label} to {ZONE_OPTIONS.find(z => z.id === destinationZone)?.label}.</p>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setEscortSubmitted(false)}
            style={{ color: 'var(--text-secondary)' }}
          >
            Request Another / Modify
          </button>
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
