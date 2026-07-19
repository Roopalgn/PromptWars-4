/**
 * Simulation Tick
 *
 * Generates a realistic, bounded simulation state for SoFi Stadium.
 * Uses a bounded random walk so occupancy changes gradually (not randomly)
 * between ticks, mimicking real sensor feed patterns.
 *
 * This module has no external dependencies — runs offline without credentials.
 */
import { randomUUID } from 'crypto';
import type {
  SimulationState,
  ZoneOccupancySignal,
  GateDelaySignal,
  WeatherSignal,
  EscortRequest,
  IncidentReport,
  Volunteer,
  NeedType,
  WeatherCondition,
} from '../types/index.js';
import { sofiVenue } from '../data/sofi-venue.js';

// ---------------------------------------------------------------------------
// Seeded random helpers (deterministic for testing when seed provided)
// ---------------------------------------------------------------------------

/** Simple LCG for deterministic pseudo-random numbers in tests. */
function makePrng(seed: number) {
  let s = seed;
  return (): number => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Production uses Math.random; tests inject a seeded PRNG
let _rand: () => number = Math.random;

export function setRng(rng: () => number): void {
  _rand = rng;
}

export function useSeed(seed: number): void {
  _rand = makePrng(seed);
}

export function resetRng(): void {
  _rand = Math.random;
}

// ---------------------------------------------------------------------------
// Occupancy random walk
// ---------------------------------------------------------------------------

const GATE_ZONE_IDS = sofiVenue.zones
  .filter((z) => z.type === 'gate')
  .map((z) => z.zoneId);

/**
 * Advance occupancy by a bounded random walk step.
 * Step is ±STEP_MAX percent, clamped to [0, 100].
 */
function walkOccupancy(current: number, stepMax = 8): number {
  const delta = (_rand() * 2 - 1) * stepMax;
  return Math.max(0, Math.min(100, current + delta));
}

/**
 * Initialise occupancy signals for all zones.
 * Gates start at 50–80% (ingress period); others start lower.
 */
export function initOccupancySignals(now: string): ZoneOccupancySignal[] {
  return sofiVenue.zones.map((zone) => {
    const isGate = zone.type === 'gate';
    const base = isGate ? 50 + _rand() * 30 : 20 + _rand() * 40;
    return {
      zoneId: zone.zoneId,
      occupancy: Math.round(base),
      trend: 'stable',
      updatedAt: now,
    };
  });
}

/**
 * Advance all occupancy signals one tick.
 * Gate zones drift toward higher occupancy during events.
 */
export function advanceOccupancySignals(
  previous: ZoneOccupancySignal[],
  now: string,
): ZoneOccupancySignal[] {
  return previous.map((signal) => {
    const isGate = GATE_ZONE_IDS.includes(signal.zoneId);
    // Gates drift upward slightly; others have neutral drift
    const bias = isGate ? 2 : 0;
    const newOccupancy = Math.round(walkOccupancy(signal.occupancy + bias));
    const trend =
      newOccupancy > signal.occupancy + 2
        ? 'rising'
        : newOccupancy < signal.occupancy - 2
        ? 'falling'
        : 'stable';
    return { ...signal, occupancy: newOccupancy, trend, updatedAt: now };
  });
}

// ---------------------------------------------------------------------------
// Gate delay signals
// ---------------------------------------------------------------------------

/**
 * Generate gate delay signals.
 * Each gate has a 20% chance of having a delay on each tick.
 */
export function generateGateDelaySignals(now: string): GateDelaySignal[] {
  const gates = sofiVenue.zones.filter((z) => z.type === 'gate');
  return gates
    .filter(() => _rand() < 0.2)
    .map((gate) => ({
      gateId: gate.zoneId,
      delayMinutes: Math.round(3 + _rand() * 20),
      cause: (['security', 'capacity', 'incident'] as const)[
        Math.floor(_rand() * 3)
      ] ?? 'security',
      fanQueueCount: Math.round(100 + _rand() * 900),
      updatedAt: now,
    }));
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

const WEATHER_CONDITIONS: WeatherCondition[] = [
  'clear',
  'clear',
  'clear',
  'rain',
  'heavy-rain',
  'heat-alert',
];

/**
 * Generate a weather signal.
 * Weighted toward clear; rain/heat are less frequent.
 */
export function generateWeatherSignal(now: string): WeatherSignal {
  const condition =
    WEATHER_CONDITIONS[Math.floor(_rand() * WEATHER_CONDITIONS.length)] ??
    'clear';
  const multiplier: Record<WeatherCondition, number> = {
    clear: 1.0,
    rain: 1.4,
    'heavy-rain': 1.8,
    'heat-alert': 1.2,
  };
  return {
    condition,
    concourseMultiplier: multiplier[condition],
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Escort requests
// ---------------------------------------------------------------------------

const NEED_TYPES: NeedType[] = [
  'wheelchair',
  'visual',
  'hearing',
  'elderly',
  'cognitive',
];

const NON_GATE_ZONES = sofiVenue.zones
  .filter((z) => z.type !== 'gate')
  .map((z) => z.zoneId);

let escortSeed = 0;

/**
 * Generate a small number of pending escort requests.
 */
export function generateEscortRequests(
  existing: EscortRequest[],
  now: string,
): EscortRequest[] {
  // Retain pending/in-progress requests
  const retained = existing.filter(
    (r) => r.status === 'pending' || r.status === 'in-progress',
  );

  // Add 0–2 new requests per tick
  const newCount = Math.floor(_rand() * 3);
  const newRequests: EscortRequest[] = [];

  for (let i = 0; i < newCount; i++) {
    const fromZone =
      NON_GATE_ZONES[Math.floor(_rand() * NON_GATE_ZONES.length)] ??
      'concourse-north';
    const toZone =
      NON_GATE_ZONES[Math.floor(_rand() * NON_GATE_ZONES.length)] ??
      'accessibility-hub';

    newRequests.push({
      requestId: randomUUID(),
      fanId: `fan-${++escortSeed}`,
      currentZone: fromZone,
      destinationZone: toZone,
      needType: NEED_TYPES[Math.floor(_rand() * NEED_TYPES.length)] ?? 'hearing',
      status: 'pending',
      requestedAt: now,
      waitingMinutes: 0,
    });
  }

  // Increment waiting time for retained requests
  const updated = retained.map((r) => ({
    ...r,
    waitingMinutes: r.waitingMinutes + 1, // 1 min per tick in simulation
  }));

  return [...updated, ...newRequests];
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

const INCIDENT_ZONE_IDS = sofiVenue.zones.map((z) => z.zoneId);

let _incidentSeed = 0;

/**
 * Maintain incident list: occasionally add new incidents, advance status.
 */
export function advanceIncidents(
  existing: IncidentReport[],
  now: string,
): IncidentReport[] {
  // Advance responding → resolved (30% chance per tick)
  const advanced: IncidentReport[] = existing.map((inc) => {
    if (inc.status === 'responding' && _rand() < 0.3) {
      return { ...inc, status: 'resolved' };
    }
    if (inc.status === 'open' && _rand() < 0.4) {
      return { ...inc, status: 'responding' };
    }
    return inc;
  });

  // Remove resolved incidents older than 3 ticks (simplification)
  const active = advanced.filter((i) => i.status !== 'resolved');

  // Occasionally add a new incident (5% chance per tick)
  if (_rand() < 0.05 && active.length < 5) {
    const types = ['medical', 'security', 'facilities', 'crowd'] as const;
    const severities = ['low', 'medium', 'high'] as const;
    active.push({
      incidentId: randomUUID(),
      type: types[Math.floor(_rand() * types.length)] ?? 'medical',
      zone:
        INCIDENT_ZONE_IDS[Math.floor(_rand() * INCIDENT_ZONE_IDS.length)] ??
        'concourse-north',
      severity: severities[Math.floor(_rand() * severities.length)] ?? 'low',
      status: 'open',
      reportedAt: now,
    });
    _incidentSeed++;
  }

  return active;
}

// ---------------------------------------------------------------------------
// Volunteers
// ---------------------------------------------------------------------------

/** Three preset volunteers for the evaluator to test with. */
export const PRESET_VOLUNTEERS: Volunteer[] = [
  {
    volunteerId: 'vol-001',
    name: 'Alex Rivera',
    currentZone: 'concourse-north',
    status: 'available',
  },
  {
    volunteerId: 'vol-002',
    name: 'Sam Chen',
    currentZone: 'concourse-east',
    status: 'available',
  },
  {
    volunteerId: 'vol-003',
    name: 'Jordan Okafor',
    currentZone: 'accessibility-hub',
    status: 'available',
  },
];

// ---------------------------------------------------------------------------
// Full tick
// ---------------------------------------------------------------------------

let currentState: SimulationState | null = null;
let tickCount = 0;

/**
 * Initialise a fresh simulation state.
 */
export function initSimulation(): SimulationState {
  const now = new Date().toISOString();
  tickCount = 0;
  currentState = {
    venueId: sofiVenue.venueId,
    tick: 0,
    timestamp: now,
    occupancySignals: initOccupancySignals(now),
    gateDelaySignals: [],
    weatherSignal: generateWeatherSignal(now),
    escortRequests: [],
    incidents: [],
    volunteers: PRESET_VOLUNTEERS,
  };
  return currentState;
}

/**
 * Advance the simulation by one tick and return the new state.
 * If no state exists, initialises one first.
 */
export function tickSimulation(): SimulationState {
  if (!currentState) return initSimulation();

  const now = new Date().toISOString();
  tickCount++;

  const occupancySignals = advanceOccupancySignals(
    currentState.occupancySignals,
    now,
  );
  // Refresh weather every 10 ticks
  const weatherSignal =
    tickCount % 10 === 0
      ? generateWeatherSignal(now)
      : { ...currentState.weatherSignal, updatedAt: now };

  const gateDelaySignals = generateGateDelaySignals(now);
  const escortRequests = generateEscortRequests(
    currentState.escortRequests,
    now,
  );
  const incidents = advanceIncidents(currentState.incidents, now);

  currentState = {
    ...currentState,
    tick: tickCount,
    timestamp: now,
    occupancySignals,
    weatherSignal,
    gateDelaySignals,
    escortRequests,
    incidents,
  };

  return currentState;
}

/**
 * Get the current simulation state (or initialise if none exists).
 */
export function getSimulationState(): SimulationState {
  return currentState ?? initSimulation();
}
