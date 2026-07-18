import { describe, it, expect } from 'vitest';
import { rankTasks, getTopTasks, TYPE_WEIGHTS } from '../../src/rules/priority-rank.js';
import type { Task } from '../../src/types/index.js';

const NOW = '2026-01-01T12:00:00Z';
const LATER = '2026-01-01T13:00:00Z';

function makeTask(overrides: Partial<Task>): Task {
  return {
    taskId: 'task-1', priority: 20, type: 'escort',
    location: 'North Concourse', zoneId: 'concourse-north',
    reasoning: 'Test', status: 'open', conflicts: [], createdAt: NOW,
    ...overrides,
  };
}

describe('TYPE_WEIGHTS', () => {
  it('medical-response = 1 (highest)', () => expect(TYPE_WEIGHTS['medical-response']).toBe(1));
  it('security-response = 2', () => expect(TYPE_WEIGHTS['security-response']).toBe(2));
  it('escort = 3', () => expect(TYPE_WEIGHTS['escort']).toBe(3));
  it('crowd-reroute = 4', () => expect(TYPE_WEIGHTS['crowd-reroute']).toBe(4));
  it('gate-rebalance = 5', () => expect(TYPE_WEIGHTS['gate-rebalance']).toBe(5));
  it('facilities = 6 (lowest)', () => expect(TYPE_WEIGHTS['facilities']).toBe(6));
});

describe('rankTasks — sort order', () => {
  it('sorts by priority ascending', () => {
    const tasks = [
      makeTask({ taskId: 'b', priority: 30 }),
      makeTask({ taskId: 'a', priority: 10 }),
      makeTask({ taskId: 'c', priority: 60 }),
    ];
    expect(rankTasks(tasks).map(t => t.taskId)).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties by type weight', () => {
    const tasks = [
      makeTask({ taskId: 'reroute', priority: 10, type: 'crowd-reroute' }),
      makeTask({ taskId: 'medical', priority: 10, type: 'medical-response' }),
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('medical');
  });

  it('breaks secondary ties by createdAt ascending', () => {
    const tasks = [
      makeTask({ taskId: 'later', priority: 10, type: 'escort', createdAt: LATER }),
      makeTask({ taskId: 'earlier', priority: 10, type: 'escort', createdAt: NOW }),
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('earlier');
  });

  it('does not mutate the input array', () => {
    const tasks = [
      makeTask({ taskId: 'b', priority: 30 }),
      makeTask({ taskId: 'a', priority: 10 }),
    ];
    const order = tasks.map(t => t.taskId);
    rankTasks(tasks);
    expect(tasks.map(t => t.taskId)).toEqual(order);
  });

  it('returns empty array for empty input', () => {
    expect(rankTasks([])).toEqual([]);
  });

  it('single task returns itself', () => {
    const t = makeTask({ taskId: 'solo', priority: 5 });
    expect(rankTasks([t])).toHaveLength(1);
  });
});

describe('rankTasks — cross-type invariants (§3.8)', () => {
  it('invariant 1: gate (21) never outranks high incident (10)', () => {
    const tasks = [
      makeTask({ taskId: 'gate', priority: 21, type: 'gate-rebalance' }),
      makeTask({ taskId: 'incident', priority: 10, type: 'medical-response' }),
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('incident');
  });

  it('invariant 2: gate (21) never outranks max-urgency escort (8)', () => {
    const tasks = [
      makeTask({ taskId: 'gate', priority: 21, type: 'gate-rebalance' }),
      makeTask({ taskId: 'escort', priority: 8, type: 'escort' }),
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('escort');
  });

  it('invariant 3: reroute at priority 9 (≥91%) outranks high incident (10)', () => {
    const tasks = [
      makeTask({ taskId: 'reroute', priority: 9, type: 'crowd-reroute' }),
      makeTask({ taskId: 'incident', priority: 10, type: 'medical-response' }),
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('reroute');
  });

  it('invariant 4: reroute at priority 10 (≤90%) loses tie to high incident via type-weight', () => {
    const tasks = [
      makeTask({ taskId: 'reroute', priority: 10, type: 'crowd-reroute' }),
      makeTask({ taskId: 'incident', priority: 10, type: 'medical-response' }),
    ];
    // type-weight: medical-response=1 < crowd-reroute=4
    expect(rankTasks(tasks)[0]!.taskId).toBe('incident');
  });

  it('invariant 5: reroute at priority 7 (≥93%) outranks max-urgency escort (8)', () => {
    const tasks = [
      makeTask({ taskId: 'escort', priority: 8, type: 'escort' }),
      makeTask({ taskId: 'reroute', priority: 7, type: 'crowd-reroute' }),
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('reroute');
  });

  it('invariant 6: reroute at priority 8 (92%) loses tie to max-urgency escort via type-weight', () => {
    const tasks = [
      makeTask({ taskId: 'reroute', priority: 8, type: 'crowd-reroute' }),
      makeTask({ taskId: 'escort', priority: 8, type: 'escort' }),
    ];
    // type-weight: escort=3 < crowd-reroute=4
    expect(rankTasks(tasks)[0]!.taskId).toBe('escort');
  });

  it('invariant 7: max-urgency escort (8) outranks high incident (10)', () => {
    const tasks = [
      makeTask({ taskId: 'incident', priority: 10, type: 'medical-response' }),
      makeTask({ taskId: 'escort', priority: 8, type: 'escort' }),
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('escort');
  });

  it('invariant 8: severe gate (21) outranks medium incident (30)', () => {
    const tasks = [
      makeTask({ taskId: 'incident', priority: 30, type: 'medical-response' }),
      makeTask({ taskId: 'gate', priority: 21, type: 'gate-rebalance' }),
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('gate');
  });
});

describe('getTopTasks', () => {
  const tasks = Array.from({ length: 15 }, (_, i) =>
    makeTask({ taskId: `t${i}`, priority: i + 1 })
  );
  it('returns top N tasks ranked correctly', () => {
    const top5 = getTopTasks(tasks, 5);
    expect(top5).toHaveLength(5);
    expect(top5[0]!.priority).toBe(1);
    expect(top5[4]!.priority).toBe(5);
  });
  it('defaults to top 10', () => {
    expect(getTopTasks(tasks)).toHaveLength(10);
  });
  it('returns all tasks if N > total', () => {
    expect(getTopTasks(tasks, 100)).toHaveLength(15);
  });
});
