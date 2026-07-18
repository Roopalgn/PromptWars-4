import { describe, it, expect } from 'vitest';
import {
  detectSameVolunteerConflicts,
  detectRouteCollisions,
  detectCompetingReroutes,
  detectConflicts,
} from '../../src/rules/conflict-detect.js';
import type { Task } from '../../src/types/index.js';

const NOW = '2026-01-01T12:00:00Z';

function makeTask(overrides: Partial<Task>): Task {
  return {
    taskId: 'task-1', priority: 15, type: 'escort',
    location: 'North Concourse', zoneId: 'concourse-north',
    reasoning: 'Test', status: 'open', conflicts: [], createdAt: NOW,
    ...overrides,
  };
}

describe('detectSameVolunteerConflicts', () => {
  it('no conflicts when each volunteer has one task', () => {
    expect(detectSameVolunteerConflicts([
      makeTask({ taskId: 't1', assignedTo: 'vol-001' }),
      makeTask({ taskId: 't2', assignedTo: 'vol-002' }),
    ])).toHaveLength(0);
  });
  it('flags two tasks to same volunteer', () => {
    const flags = detectSameVolunteerConflicts([
      makeTask({ taskId: 't1', assignedTo: 'vol-001' }),
      makeTask({ taskId: 't2', assignedTo: 'vol-001' }),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.conflictType).toBe('same-volunteer');
    expect([flags[0]!.taskA, flags[0]!.taskB]).toContain('t1');
    expect([flags[0]!.taskA, flags[0]!.taskB]).toContain('t2');
  });
  it('flags all pairs when three tasks share one volunteer', () => {
    const flags = detectSameVolunteerConflicts([
      makeTask({ taskId: 't1', assignedTo: 'vol-001' }),
      makeTask({ taskId: 't2', assignedTo: 'vol-001' }),
      makeTask({ taskId: 't3', assignedTo: 'vol-001' }),
    ]);
    expect(flags).toHaveLength(3);
  });
  it('ignores unassigned tasks', () => {
    expect(detectSameVolunteerConflicts([
      makeTask({ taskId: 't1' }),
      makeTask({ taskId: 't2' }),
    ])).toHaveLength(0);
  });
  it('each flag has a non-empty conflictId', () => {
    const flags = detectSameVolunteerConflicts([
      makeTask({ taskId: 't1', assignedTo: 'vol-001' }),
      makeTask({ taskId: 't2', assignedTo: 'vol-001' }),
    ]);
    expect(flags[0]!.conflictId).toBeTruthy();
  });
});

describe('detectRouteCollisions', () => {
  it('no conflict for different destinations', () => {
    expect(detectRouteCollisions([
      makeTask({ taskId: 't1', type: 'crowd-reroute', metadata: { alternativeZoneId: 'gate-a' } }),
      makeTask({ taskId: 't2', type: 'crowd-reroute', metadata: { alternativeZoneId: 'gate-b' } }),
    ])).toHaveLength(0);
  });
  it('flags two reroutes with same destination', () => {
    const flags = detectRouteCollisions([
      makeTask({ taskId: 't1', type: 'crowd-reroute', metadata: { alternativeZoneId: 'gate-a' } }),
      makeTask({ taskId: 't2', type: 'crowd-reroute', metadata: { alternativeZoneId: 'gate-a' } }),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.conflictType).toBe('route-collision');
  });
  it('ignores non-reroute tasks even with same metadata', () => {
    expect(detectRouteCollisions([
      makeTask({ taskId: 't1', type: 'escort', metadata: { alternativeZoneId: 'gate-a' } }),
      makeTask({ taskId: 't2', type: 'escort', metadata: { alternativeZoneId: 'gate-a' } }),
    ])).toHaveLength(0);
  });
  it('ignores reroutes with no alternativeZoneId', () => {
    expect(detectRouteCollisions([
      makeTask({ taskId: 't1', type: 'crowd-reroute', metadata: {} }),
      makeTask({ taskId: 't2', type: 'crowd-reroute', metadata: {} }),
    ])).toHaveLength(0);
  });
});

describe('detectCompetingReroutes', () => {
  it('flags reroute whose destination is on escort path', () => {
    const flags = detectCompetingReroutes([
      makeTask({ taskId: 'rr', type: 'crowd-reroute', zoneId: 'concourse-north', metadata: { alternativeZoneId: 'gate-a' } }),
      makeTask({ taskId: 'es', type: 'escort', metadata: { routePath: ['concourse-north', 'gate-a', 'accessibility-hub'] } }),
    ]);
    expect(flags.length).toBeGreaterThanOrEqual(1);
    expect(flags[0]!.conflictType).toBe('competing-reroute');
  });
  it('no conflict when paths do not overlap', () => {
    expect(detectCompetingReroutes([
      makeTask({ taskId: 'rr', type: 'crowd-reroute', zoneId: 'concourse-north', metadata: { alternativeZoneId: 'gate-b' } }),
      makeTask({ taskId: 'es', type: 'escort', metadata: { routePath: ['concourse-east', 'accessibility-hub'] } }),
    ])).toHaveLength(0);
  });
  it('flags when reroute source zone is on escort path', () => {
    const flags = detectCompetingReroutes([
      makeTask({ taskId: 'rr', type: 'crowd-reroute', zoneId: 'concourse-north', metadata: { alternativeZoneId: 'gate-c' } }),
      makeTask({ taskId: 'es', type: 'escort', metadata: { routePath: ['gate-a', 'concourse-north', 'section-100s'] } }),
    ]);
    expect(flags.length).toBeGreaterThanOrEqual(1);
  });
});

describe('detectConflicts (composite)', () => {
  it('annotates task.conflicts arrays with conflict IDs', () => {
    const t1 = makeTask({ taskId: 't1', assignedTo: 'vol-001' });
    const t2 = makeTask({ taskId: 't2', assignedTo: 'vol-001' });
    const flags = detectConflicts([t1, t2]);
    expect(flags).toHaveLength(1);
    expect(t1.conflicts).toContain(flags[0]!.conflictId);
    expect(t2.conflicts).toContain(flags[0]!.conflictId);
  });
  it('does not add duplicate conflict IDs to the same task', () => {
    const t1 = makeTask({ taskId: 't1', assignedTo: 'vol-001' });
    const t2 = makeTask({ taskId: 't2', assignedTo: 'vol-001' });
    detectConflicts([t1, t2]);
    const unique = new Set(t1.conflicts);
    expect(unique.size).toBe(t1.conflicts.length);
  });
  it('returns empty array with no conflicts', () => {
    const tasks = [
      makeTask({ taskId: 't1', assignedTo: 'vol-001' }),
      makeTask({ taskId: 't2', assignedTo: 'vol-002' }),
    ];
    expect(detectConflicts(tasks)).toHaveLength(0);
  });
});
