import React from 'react';
import type { ZoneStatus } from '../api/client.js';

const TYPE_ICONS: Record<string, string> = {
  gate: '🚪', concourse: '🏟️', section: '💺',
  medical: '🏥', accessibility: '♿', food: '🍔', restroom: '🚻',
};

function getZoneType(zoneId: string): string {
  for (const key of Object.keys(TYPE_ICONS)) {
    if (zoneId.includes(key)) return key;
  }
  return 'gate';
}

interface Props { zones: ZoneStatus[]; }

export function ZoneGrid({ zones }: Props) {
  if (zones.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No zone data available.</p>;
  }

  // Sort: critical first, then busy, then comfortable
  const sorted = [...zones].sort((a, b) => {
    const order = { critical: 0, busy: 1, comfortable: 2 };
    return (order[a.status] ?? 2) - (order[b.status] ?? 2);
  });

  return (
    <div className="zone-grid" role="list" aria-label="Zone status grid">
      {sorted.map(zone => (
        <div
          key={zone.zoneId}
          className={`zone-tile zone-tile--${zone.status}`}
          role="listitem"
          aria-label={`${zone.zoneId}: ${zone.status}, ${Math.round(zone.weatherAdjustedPct)}% capacity`}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
            <span className="zone-tile__name">
              {TYPE_ICONS[getZoneType(zone.zoneId)] ?? '📍'} {zone.zoneId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <span className={`status-pill status-pill--${zone.status}`} aria-hidden="true">
              {zone.status}
            </span>
          </div>
          <div className="zone-tile__bar-track" role="progressbar" aria-valuenow={Math.round(zone.weatherAdjustedPct)} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`zone-tile__bar-fill zone-tile__bar-fill--${zone.status}`}
              style={{ width: `${Math.min(100, zone.weatherAdjustedPct)}%` }}
            />
          </div>
          <div className="occupancy-pct">
            {Math.round(zone.weatherAdjustedPct)}% adjusted
            {zone.weatherAdjustedPct !== zone.occupancyPct && (
              <span style={{ opacity: 0.7 }}> ({Math.round(zone.occupancyPct)}% raw)</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
