/**
 * Rule 1: Zone Status Classification
 *
 * Pure function — no I/O, no side effects.
 * Classifies each zone into comfortable / busy / critical
 * based on occupancy percentage adjusted for weather.
 */
import type { Zone, ZoneOccupancySignal, WeatherSignal, ZoneStatus, ZoneStatusLevel } from '../types/index.js';

export const THRESHOLDS = {
  /** Below this = comfortable. */
  BUSY: 70,
  /** Above this = critical. */
  CRITICAL: 85,
} as const;

/**
 * Compute the weather-adjusted occupancy percentage for a zone.
 * Only concourse-type zones receive the full multiplier;
 * gates and sections receive a partial multiplier (capped at 1.5).
 */
export function computeAdjustedPct(
  occupancyPct: number,
  zoneType: Zone['type'],
  weather: WeatherSignal,
): number {
  const multiplier =
    zoneType === 'concourse'
      ? weather.concourseMultiplier
      : Math.min(weather.concourseMultiplier, 1.5);
  return Math.min(100, occupancyPct * multiplier);
}

/**
 * Classify a numeric adjusted occupancy percentage into a status level.
 */
export function classifyLevel(adjustedPct: number): ZoneStatusLevel {
  if (adjustedPct < THRESHOLDS.BUSY) return 'comfortable';
  if (adjustedPct <= THRESHOLDS.CRITICAL) return 'busy';
  return 'critical';
}

/**
 * Classify a single zone's status given its occupancy signal and current weather.
 */
export function classifyZoneStatus(
  zone: Zone,
  signal: ZoneOccupancySignal,
  weather: WeatherSignal,
): ZoneStatus {
  const weatherAdjustedPct = computeAdjustedPct(signal.occupancy, zone.type, weather);
  return {
    zoneId: zone.zoneId,
    status: classifyLevel(weatherAdjustedPct),
    occupancyPct: signal.occupancy,
    weatherAdjustedPct,
  };
}

/**
 * Classify all zones from a batch of signals.
 * Zones with no matching signal are omitted.
 */
export function classifyAllZones(
  zones: Zone[],
  signals: ZoneOccupancySignal[],
  weather: WeatherSignal,
): ZoneStatus[] {
  const signalMap = new Map(signals.map((s) => [s.zoneId, s]));
  const results: ZoneStatus[] = [];

  for (const zone of zones) {
    const signal = signalMap.get(zone.zoneId);
    if (!signal) continue;
    results.push(classifyZoneStatus(zone, signal, weather));
  }

  return results;
}
