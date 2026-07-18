import { describe, it, expect } from 'vitest';
import {
  computeAdjustedPct,
  classifyLevel,
  classifyZoneStatus,
  classifyAllZones,
  THRESHOLDS,
} from '../../src/rules/zone-status.js';
import type { Zone, ZoneOccupancySignal, WeatherSignal } from '../../src/types/index.js';

const clearWeather: WeatherSignal = { condition: 'clear', concourseMultiplier: 1.0, updatedAt: '2026-01-01T00:00:00Z' };
const rainWeather: WeatherSignal = { condition: 'rain', concourseMultiplier: 1.4, updatedAt: '2026-01-01T00:00:00Z' };
const heavyRainWeather: WeatherSignal = { condition: 'heavy-rain', concourseMultiplier: 1.8, updatedAt: '2026-01-01T00:00:00Z' };

const concourseZone: Zone = {
  zoneId: 'concourse-north', name: 'North Concourse', type: 'concourse',
  capacity: 12000, currentOccupancy: 0, accessibleRoutes: [], adjacentZones: [],
  coordinates: { x: 50, y: 20 },
};
const gateZone: Zone = {
  zoneId: 'gate-a', name: 'Gate A', type: 'gate',
  capacity: 8000, currentOccupancy: 0, accessibleRoutes: [], adjacentZones: [],
  coordinates: { x: 50, y: 5 },
};

describe('computeAdjustedPct', () => {
  it('returns raw occupancy for clear weather on concourse', () => {
    expect(computeAdjustedPct(60, 'concourse', clearWeather)).toBeCloseTo(60);
  });
  it('applies full multiplier to concourse in rain', () => {
    expect(computeAdjustedPct(60, 'concourse', rainWeather)).toBeCloseTo(84);
  });
  it('caps gate multiplier at 1.5 even in heavy rain (1.8 → 1.5)', () => {
    expect(computeAdjustedPct(60, 'gate', heavyRainWeather)).toBeCloseTo(90);
  });
  it('clamps result to 100 when multiplier would exceed it', () => {
    expect(computeAdjustedPct(100, 'concourse', heavyRainWeather)).toBe(100);
  });
  it('returns 0 for 0 occupancy regardless of weather', () => {
    expect(computeAdjustedPct(0, 'concourse', heavyRainWeather)).toBe(0);
  });
  it('section type also gets capped multiplier (not full concourse)', () => {
    // section uses min(1.8, 1.5) = 1.5; 50 * 1.5 = 75
    expect(computeAdjustedPct(50, 'section', heavyRainWeather)).toBeCloseTo(75);
  });
});

describe('classifyLevel', () => {
  it('comfortable below BUSY threshold', () => {
    expect(classifyLevel(0)).toBe('comfortable');
    expect(classifyLevel(69)).toBe('comfortable');
    expect(classifyLevel(THRESHOLDS.BUSY - 1)).toBe('comfortable');
  });
  it('busy at exactly BUSY threshold', () => {
    expect(classifyLevel(THRESHOLDS.BUSY)).toBe('busy');
  });
  it('busy between thresholds', () => {
    expect(classifyLevel(77)).toBe('busy');
    expect(classifyLevel(THRESHOLDS.CRITICAL)).toBe('busy');
  });
  it('critical strictly above CRITICAL threshold', () => {
    expect(classifyLevel(THRESHOLDS.CRITICAL + 0.1)).toBe('critical');
    expect(classifyLevel(100)).toBe('critical');
  });
});

describe('classifyZoneStatus', () => {
  const signal: ZoneOccupancySignal = {
    zoneId: 'concourse-north', occupancy: 60, trend: 'rising', updatedAt: '2026-01-01T00:00:00Z',
  };
  it('returns correct zoneId', () => {
    expect(classifyZoneStatus(concourseZone, signal, clearWeather).zoneId).toBe('concourse-north');
  });
  it('comfortable at 60% clear weather', () => {
    const r = classifyZoneStatus(concourseZone, signal, clearWeather);
    expect(r.status).toBe('comfortable');
    expect(r.occupancyPct).toBe(60);
    expect(r.weatherAdjustedPct).toBeCloseTo(60);
  });
  it('busy at 60% in rain (60 × 1.4 = 84)', () => {
    const r = classifyZoneStatus(concourseZone, signal, rainWeather);
    expect(r.status).toBe('busy');
    expect(r.weatherAdjustedPct).toBeCloseTo(84);
  });
  it('critical at 80% in heavy rain (80 × 1.8 = 144 → clamped 100)', () => {
    const r = classifyZoneStatus(concourseZone, { ...signal, occupancy: 80 }, heavyRainWeather);
    expect(r.status).toBe('critical');
  });
});

describe('classifyAllZones', () => {
  const zones: Zone[] = [concourseZone, gateZone];
  const signals: ZoneOccupancySignal[] = [
    { zoneId: 'concourse-north', occupancy: 50, trend: 'stable', updatedAt: '2026-01-01T00:00:00Z' },
    { zoneId: 'gate-a', occupancy: 90, trend: 'rising', updatedAt: '2026-01-01T00:00:00Z' },
  ];
  it('returns one status per zone with signal', () => {
    expect(classifyAllZones(zones, signals, clearWeather)).toHaveLength(2);
  });
  it('omits zones with no matching signal', () => {
    const r = classifyAllZones(zones, signals.slice(0, 1), clearWeather);
    expect(r).toHaveLength(1);
    expect(r[0]!.zoneId).toBe('concourse-north');
  });
  it('gate at 90% clear = critical', () => {
    const r = classifyAllZones(zones, signals, clearWeather);
    expect(r.find(s => s.zoneId === 'gate-a')!.status).toBe('critical');
  });
});
