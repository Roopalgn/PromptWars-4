import { describe, it, expect, beforeAll } from 'vitest';
import { computeTaskQueue } from '../../src/rules/index.js';
import { initSimulation, tickSimulation, useSeed, resetRng } from '../../src/simulation/tick.js';
import { sofiVenue } from '../../src/data/sofi-venue.js';

beforeAll(() => { delete process.env['GEMINI_API_KEY']; });

describe('Offline path — rules engine without credentials', () => {
  it('returns valid output with no API key', () => {
    useSeed(42);
    const state = initSimulation();
    resetRng();
    const r = computeTaskQueue({ venue: sofiVenue, state });
    expect(r.zoneStatuses).toBeDefined();
    expect(Array.isArray(r.tasks)).toBe(true);
    expect(Array.isArray(r.conflicts)).toBe(true);
  });

  it('tasks sorted ascending with no API key', () => {
    useSeed(123);
    const state = tickSimulation();
    resetRng();
    const { tasks } = computeTaskQueue({ venue: sofiVenue, state });
    for (let i = 1; i < tasks.length; i++) {
      expect(tasks[i - 1]!.priority).toBeLessThanOrEqual(tasks[i]!.priority);
    }
  });

  it('every task has all required fields', () => {
    useSeed(999);
    const state = tickSimulation();
    resetRng();
    const { tasks } = computeTaskQueue({ venue: sofiVenue, state });
    for (const task of tasks) {
      expect(task.taskId).toBeTruthy();
      expect(typeof task.priority).toBe('number');
      expect(task.type).toBeTruthy();
      expect(task.reasoning).toBeTruthy();
      expect(task.zoneId).toBeTruthy();
      expect(Array.isArray(task.conflicts)).toBe(true);
      expect(task.createdAt).toBeTruthy();
    }
  });

  it('simulation is deterministic with same seed', () => {
    useSeed(7);
    const state1 = initSimulation();
    const r1 = computeTaskQueue({ venue: sofiVenue, state: state1 });
    useSeed(7);
    const state2 = initSimulation();
    const r2 = computeTaskQueue({ venue: sofiVenue, state: state2 });
    expect(r1.zoneStatuses.map(s => s.status)).toEqual(r2.zoneStatuses.map(s => s.status));
  });

  it('handles zero-signal state without crash', () => {
    const emptyState = {
      venueId: 'sofi-stadium', tick: 0,
      timestamp: new Date().toISOString(),
      occupancySignals: [],
      gateDelaySignals: [],
      weatherSignal: { condition: 'clear' as const, concourseMultiplier: 1.0, updatedAt: new Date().toISOString() },
      escortRequests: [],
      incidents: [],
      volunteers: [],
    };
    const r = computeTaskQueue({ venue: sofiVenue, state: emptyState });
    expect(r.tasks).toHaveLength(0);
    expect(r.conflicts).toHaveLength(0);
  });

  it('zone statuses are stable across multiple ticks', () => {
    useSeed(55);
    initSimulation();
    for (let i = 0; i < 5; i++) {
      const state = tickSimulation();
      const r = computeTaskQueue({ venue: sofiVenue, state });
      expect(r.zoneStatuses).toHaveLength(sofiVenue.zones.length);
    }
    resetRng();
  });
});
