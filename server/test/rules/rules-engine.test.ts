/**
 * Integration tests for the full rules engine pipeline.
 * Uses deterministic inputs — no mocks needed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { computeTaskQueue } from '../../src/rules/index.js';
import { sofiVenue } from '../../src/data/sofi-venue.js';
import type {
  SimulationState,
  ZoneOccupancySignal,
  GateDelaySignal,
  WeatherSignal,
  EscortRequest,
  IncidentReport,
  Volunteer,
} from '../../src/types/index.js';

const NOW = '2026-01-01T12:00:00Z';

const clearWeather: WeatherSignal = {
  condition: 'clear', concourseMultiplier: 1.0, updatedAt: NOW,
};

const volunteers: Volunteer[] = [
  { volunteerId: 'vol-001', name: 'Alex', currentZone: 'concourse-north', status: 'available' },
  { volunteerId: 'vol-002', name: 'Sam', currentZone: 'concourse-east', status: 'available' },
];

function makeState(overrides: Partial<SimulationState> = {}): SimulationState {
  return {
    venueId: 'sofi-stadium',
    tick: 1,
    timestamp: NOW,
    occupancySignals: sofiVenue.zones.map((z) => ({
      zoneId: z.zoneId, occupancy: 30, trend: 'stable' as const, updatedAt: NOW,
    })),
    gateDelaySignals: [],
    weatherSignal: clearWeather,
    escortRequests: [],
    incidents: [],
    volunteers,
    ...overrides,
  };
}

describe('computeTaskQueue — shape and defaults', () => {
  it('returns zoneStatuses, tasks, conflicts', () => {
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState() });
    expect(r).toHaveProperty('zoneStatuses');
    expect(r).toHaveProperty('tasks');
    expect(r).toHaveProperty('conflicts');
  });

  it('classifies all zones that have signals', () => {
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState() });
    expect(r.zoneStatuses).toHaveLength(sofiVenue.zones.length);
  });

  it('no reroute/gate tasks when all zones comfortable and no delays', () => {
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState() });
    expect(r.tasks.filter(t => t.type === 'crowd-reroute')).toHaveLength(0);
    expect(r.tasks.filter(t => t.type === 'gate-rebalance')).toHaveLength(0);
  });
});

describe('computeTaskQueue — signal-driven task generation', () => {
  it('generates reroute task for critical zone (92%)', () => {
    const signals: ZoneOccupancySignal[] = sofiVenue.zones.map((z) => ({
      zoneId: z.zoneId,
      occupancy: z.zoneId === 'concourse-north' ? 92 : 30,
      trend: 'stable' as const, updatedAt: NOW,
    }));
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState({ occupancySignals: signals }) });
    const reroutes = r.tasks.filter(t => t.type === 'crowd-reroute');
    expect(reroutes).toHaveLength(1);
    expect(reroutes[0]!.priority).toBe(8); // 100 - 92 = 8
  });

  it('generates gate-rebalance task for delay > 5 min', () => {
    const gates: GateDelaySignal[] = [{ gateId: 'gate-a', delayMinutes: 15, cause: 'capacity', fanQueueCount: 400, updatedAt: NOW }];
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState({ gateDelaySignals: gates }) });
    const gateTasks = r.tasks.filter(t => t.type === 'gate-rebalance');
    expect(gateTasks).toHaveLength(1);
    expect(gateTasks[0]!.zoneId).toBe('gate-a');
  });

  it('generates incident task for open high-severity medical incident (priority 10)', () => {
    const incidents: IncidentReport[] = [{
      incidentId: 'inc-1', type: 'medical', zone: 'concourse-north',
      severity: 'high', status: 'open', reportedAt: NOW,
    }];
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState({ incidents }) });
    const medTasks = r.tasks.filter(t => t.type === 'medical-response');
    expect(medTasks).toHaveLength(1);
    expect(medTasks[0]!.priority).toBe(10);
  });

  it('generates escort task and assigns volunteer', () => {
    const escort: EscortRequest = {
      requestId: 'req-1', fanId: 'fan-1',
      currentZone: 'concourse-north', destinationZone: 'accessibility-hub',
      needType: 'wheelchair', status: 'pending', requestedAt: NOW, waitingMinutes: 5,
    };
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState({ escortRequests: [escort] }) });
    const escortTasks = r.tasks.filter(t => t.type === 'escort');
    expect(escortTasks).toHaveLength(1);
    expect(escortTasks[0]!.assignedTo).toBeDefined();
    expect(escortTasks[0]!.priority).toBe(16); // 20 - 4 (wheelchair) = 16; wait=5 < 10
  });

  it('skips resolved incidents', () => {
    const incidents: IncidentReport[] = [{
      incidentId: 'inc-resolved', type: 'medical', zone: 'concourse-north',
      severity: 'high', status: 'resolved', reportedAt: NOW,
    }];
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState({ incidents }) });
    expect(r.tasks.filter(t => t.type === 'medical-response')).toHaveLength(0);
  });
});

describe('computeTaskQueue — sorted output', () => {
  it('tasks are sorted by priority ascending', () => {
    const incidents: IncidentReport[] = [
      { incidentId: 'i1', type: 'medical', zone: 'concourse-north', severity: 'low', status: 'open', reportedAt: NOW },
      { incidentId: 'i2', type: 'security', zone: 'gate-a', severity: 'high', status: 'open', reportedAt: NOW },
    ];
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState({ incidents }) });
    for (let i = 1; i < r.tasks.length; i++) {
      expect(r.tasks[i - 1]!.priority).toBeLessThanOrEqual(r.tasks[i]!.priority);
    }
  });
});

describe('computeTaskQueue — offline path (no credentials)', () => {
  beforeAll(() => { delete process.env['GEMINI_API_KEY']; });

  it('works with no API key set', () => {
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState() });
    expect(r.zoneStatuses.length).toBeGreaterThan(0);
  });

  it('handles empty simulation state gracefully', () => {
    const emptyState: SimulationState = {
      venueId: 'sofi-stadium', tick: 0, timestamp: NOW,
      occupancySignals: [], gateDelaySignals: [],
      weatherSignal: clearWeather,
      escortRequests: [], incidents: [], volunteers: [],
    };
    const r = computeTaskQueue({ venue: sofiVenue, state: emptyState });
    expect(r.tasks).toHaveLength(0);
    expect(r.conflicts).toHaveLength(0);
  });
});

describe('computeTaskQueue — conflict detection integration', () => {
  it('with one volunteer and two escort requests, generates only one task', () => {
    const requests: EscortRequest[] = [
      { requestId: 'r1', fanId: 'f1', currentZone: 'concourse-north', destinationZone: 'accessibility-hub', needType: 'hearing', status: 'pending', requestedAt: NOW, waitingMinutes: 0 },
      { requestId: 'r2', fanId: 'f2', currentZone: 'concourse-east', destinationZone: 'accessibility-hub', needType: 'hearing', status: 'pending', requestedAt: NOW, waitingMinutes: 0 },
    ];
    const r = computeTaskQueue({ venue: sofiVenue, state: makeState({ escortRequests: requests, volunteers: [volunteers[0]!] }) });
    expect(r.tasks.filter(t => t.type === 'escort')).toHaveLength(1);
  });
});
