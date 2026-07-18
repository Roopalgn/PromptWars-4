import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ZoneGrid } from '../components/ZoneGrid.js';
import type { ZoneStatus } from '../api/client.js';

const zones: ZoneStatus[] = [
  { zoneId: 'gate-a', status: 'comfortable', occupancyPct: 40, weatherAdjustedPct: 40 },
  { zoneId: 'concourse-north', status: 'busy', occupancyPct: 75, weatherAdjustedPct: 75 },
  { zoneId: 'gate-b', status: 'critical', occupancyPct: 92, weatherAdjustedPct: 92 },
];

describe('ZoneGrid', () => {
  it('renders zone cards for each zone', () => {
    render(<ZoneGrid zones={zones} />);
    const cards = screen.getAllByRole('listitem');
    expect(cards.length).toBe(3);
  });

  it('shows comfortable status pill', () => {
    render(<ZoneGrid zones={[zones[0]!]} />);
    expect(screen.getByText('comfortable')).toBeInTheDocument();
  });

  it('shows busy status pill', () => {
    render(<ZoneGrid zones={[zones[1]!]} />);
    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('shows critical status pill', () => {
    render(<ZoneGrid zones={[zones[2]!]} />);
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('shows adjusted occupancy percentage', () => {
    render(<ZoneGrid zones={[zones[0]!]} />);
    // 40% adjusted
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  it('renders empty paragraph when no zones passed', () => {
    render(<ZoneGrid zones={[]} />);
    expect(screen.getByText(/no zone data/i)).toBeInTheDocument();
  });

  it('sorts critical zones first', () => {
    render(<ZoneGrid zones={zones} />);
    const cards = screen.getAllByRole('listitem');
    // First card should be critical (gate-b)
    expect(cards[0]).toHaveAttribute('aria-label', expect.stringContaining('critical'));
  });

  it('has accessible aria-label on grid', () => {
    render(<ZoneGrid zones={zones} />);
    expect(screen.getByRole('list', { name: /zone status grid/i })).toBeInTheDocument();
  });
});
