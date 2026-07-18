import { describe, it, expect } from 'vitest';
import {
  computeEscortPriority,
  requiresAccessibleRoute,
  matchEscortToVolunteer,
  generateAllEscortTasks,
} from '../../src/rules/escort-match.js';
import { rankTasks } from '../../src/rules/priority-rank.js';
import type { EscortRequest, Volunteer, ZoneStatus } from '../../src/types/index.js';

const NOW = '2026-01-01T12:00:00Z';

function makeRequest(overrides: Partial<EscortRequest> = {}): EscortRequest {
  return {
    requestId: 'req-1', fanId: 'fan-1',
    currentZone: 'concourse-north', destinationZone: 'accessibility-hub',
    needType: 'hearing', status: 'pending', requestedAt: NOW, waitingMinutes: 0,
    ...overrides,
  };
}

const volunteer: Volunteer = {
  volunteerId: 'vol-001', name: 'Alex Rivera',
  currentZone: 'concourse-north', status: 'available',
};

const zoneStatuses: ZoneStatus[] = [
  { zoneId: 'concourse-north', status: 'comfortable', occupancyPct: 40, weatherAdjustedPct: 40 },
  { zoneId: 'accessibility-hub', status: 'comfortable', occupancyPct: 20, weatherAdjustedPct: 20 },
];

// ── Formula correctness ─────────────────────────────────────────────────────
describe('computeEscortPriority — formula', () => {
  it('base priority = 20 for hearing with no wait', () => {
    expect(computeEscortPriority({ needType: 'hearing', waitingMinutes: 0 })).toBe(20);
  });
  it('wheelchair: 20 − 4 = 16', () => {
    expect(computeEscortPriority({ needType: 'wheelchair', waitingMinutes: 5 })).toBe(16);
  });
  it('visual same as wheelchair: 16', () => {
    expect(computeEscortPriority({ needType: 'visual', waitingMinutes: 0 })).toBe(16);
  });
  it('elderly: 20 − 3 = 17', () => {
    expect(computeEscortPriority({ needType: 'elderly', waitingMinutes: 0 })).toBe(17);
  });
  it('cognitive same as elderly: 17', () => {
    expect(computeEscortPriority({ needType: 'cognitive', waitingMinutes: 0 })).toBe(17);
  });
  it('hearing has no needType deduction (wait < 10): stays 20', () => {
    expect(computeEscortPriority({ needType: 'hearing', waitingMinutes: 9 })).toBe(20);
  });
  it('>10min wait adds −5: elderly + 12min = 20 − 3 − 5 = 12', () => {
    expect(computeEscortPriority({ needType: 'elderly', waitingMinutes: 12 })).toBe(12);
  });
  it('>20min STACKS with >10min: visual + 25min = 20 − 4 − 5 − 3 = 8', () => {
    expect(computeEscortPriority({ needType: 'visual', waitingMinutes: 25 })).toBe(8);
  });
  it('floor = 8: wheelchair + 25min = max(8, 20−12) = 8', () => {
    expect(computeEscortPriority({ needType: 'wheelchair', waitingMinutes: 25 })).toBe(8);
  });
  it('>10min and >20min STACK (not replace): hearing + 25min = 20 − 5 − 3 = 12', () => {
    expect(computeEscortPriority({ needType: 'hearing', waitingMinutes: 25 })).toBe(12);
    expect(computeEscortPriority({ needType: 'hearing', waitingMinutes: 12 })).toBe(15);
    expect(computeEscortPriority({ needType: 'hearing', waitingMinutes: 25 }))
      .toBeLessThan(computeEscortPriority({ needType: 'hearing', waitingMinutes: 12 }));
  });
  it('exactly 10min wait does NOT trigger >10 deduction', () => {
    expect(computeEscortPriority({ needType: 'hearing', waitingMinutes: 10 })).toBe(20);
  });
  it('exactly 20min wait does NOT trigger >20 deduction', () => {
    // >10 fires, >20 does not: 20 − 5 = 15
    expect(computeEscortPriority({ needType: 'hearing', waitingMinutes: 20 })).toBe(15);
  });
});

// ── ADR-7 ordering invariants ───────────────────────────────────────────────
describe('computeEscortPriority — cross-type invariants (ADR-7)', () => {
  it('invariant 7: max-urgency escort (8) outranks high incident (10)', () => {
    expect(computeEscortPriority({ needType: 'visual', waitingMinutes: 25 })).toBeLessThan(10);
  });
  it('escort floor (8) is more urgent than reroute at 92% (priority 8) via type-weight', () => {
    // Both priority 8; type-weight: escort=3 < reroute=4 → escort wins
    const escortTask = { taskId: 'e', priority: 8, type: 'escort' as const, location: '', zoneId: '', reasoning: '', status: 'open' as const, conflicts: [], createdAt: NOW };
    const rerouteTask = { taskId: 'r', priority: 8, type: 'crowd-reroute' as const, location: '', zoneId: '', reasoning: '', status: 'open' as const, conflicts: [], createdAt: NOW };
    const ranked = rankTasks([rerouteTask, escortTask]);
    expect(ranked[0]!.taskId).toBe('e');
  });
  it('reroute at 93% (priority 7) outranks max-urgency escort (priority 8)', () => {
    const escortTask = { taskId: 'e', priority: 8, type: 'escort' as const, location: '', zoneId: '', reasoning: '', status: 'open' as const, conflicts: [], createdAt: NOW };
    const rerouteTask = { taskId: 'r', priority: 7, type: 'crowd-reroute' as const, location: '', zoneId: '', reasoning: '', status: 'open' as const, conflicts: [], createdAt: NOW };
    const ranked = rankTasks([escortTask, rerouteTask]);
    expect(ranked[0]!.taskId).toBe('r');
  });
  it('high-vulnerability long-wait outranks routine escort', () => {
    const tasks = [
      { taskId: 'high', priority: computeEscortPriority({ needType: 'visual', waitingMinutes: 25 }), type: 'escort' as const, location: '', zoneId: '', reasoning: '', status: 'open' as const, conflicts: [], createdAt: NOW },
      { taskId: 'low', priority: computeEscortPriority({ needType: 'hearing', waitingMinutes: 3 }), type: 'escort' as const, location: '', zoneId: '', reasoning: '', status: 'open' as const, conflicts: [], createdAt: NOW },
    ];
    expect(rankTasks(tasks)[0]!.taskId).toBe('high');
  });
});

// ── Route requirements ──────────────────────────────────────────────────────
describe('requiresAccessibleRoute', () => {
  it('true for wheelchair and visual', () => {
    expect(requiresAccessibleRoute('wheelchair')).toBe(true);
    expect(requiresAccessibleRoute('visual')).toBe(true);
  });
  it('false for hearing, elderly, cognitive', () => {
    expect(requiresAccessibleRoute('hearing')).toBe(false);
    expect(requiresAccessibleRoute('elderly')).toBe(false);
    expect(requiresAccessibleRoute('cognitive')).toBe(false);
  });
});

// ── matchEscortToVolunteer ──────────────────────────────────────────────────
describe('matchEscortToVolunteer', () => {
  it('returns null for non-pending request', () => {
    expect(matchEscortToVolunteer(makeRequest({ status: 'assigned' }), [volunteer], zoneStatuses, NOW)).toBeNull();
  });
  it('returns null when no volunteers available', () => {
    const busy: Volunteer = { ...volunteer, status: 'busy' };
    expect(matchEscortToVolunteer(makeRequest(), [busy], zoneStatuses, NOW)).toBeNull();
  });
  it('returns task with correct type and assignee', () => {
    const task = matchEscortToVolunteer(makeRequest(), [volunteer], zoneStatuses, NOW);
    expect(task).not.toBeNull();
    expect(task!.type).toBe('escort');
    expect(task!.assignedTo).toBe('vol-001');
  });
  it('correct priority in returned task', () => {
    const task = matchEscortToVolunteer(makeRequest({ needType: 'visual', waitingMinutes: 25 }), [volunteer], zoneStatuses, NOW);
    expect(task!.priority).toBe(8);
  });
  it('metadata includes requestId, needType, routePath', () => {
    const task = matchEscortToVolunteer(makeRequest({ requestId: 'req-99' }), [volunteer], zoneStatuses, NOW);
    expect(task!.metadata?.['requestId']).toBe('req-99');
    expect(task!.metadata?.['needType']).toBe('hearing');
    expect(task!.metadata?.['routePath']).toBeDefined();
  });
});

// ── generateAllEscortTasks ──────────────────────────────────────────────────
describe('generateAllEscortTasks', () => {
  it('processes highest-priority requests first', () => {
    const v1 = { ...volunteer };
    const v2 = { ...volunteer, volunteerId: 'vol-002', name: 'Sam', currentZone: 'concourse-east' };
    const requests: EscortRequest[] = [
      makeRequest({ requestId: 'low-pri', needType: 'hearing', waitingMinutes: 2 }),
      makeRequest({ requestId: 'hi-pri', needType: 'visual', waitingMinutes: 25 }),
    ];
    const tasks = generateAllEscortTasks(requests, [v1, v2], zoneStatuses, NOW);
    const hiTask = tasks.find(t => t.metadata?.['requestId'] === 'hi-pri');
    expect(hiTask).toBeDefined();
    expect(hiTask!.priority).toBe(8);
  });
  it('does not double-assign a volunteer', () => {
    const requests: EscortRequest[] = [
      makeRequest({ requestId: 'r1' }),
      makeRequest({ requestId: 'r2' }),
    ];
    const tasks = generateAllEscortTasks(requests, [volunteer], zoneStatuses, NOW);
    const assigned = tasks.filter(t => t.assignedTo === 'vol-001');
    expect(assigned).toHaveLength(1);
  });
  it('skips non-pending requests', () => {
    const requests: EscortRequest[] = [
      makeRequest({ requestId: 'r1', status: 'completed' }),
      makeRequest({ requestId: 'r2', status: 'pending' }),
    ];
    const tasks = generateAllEscortTasks(requests, [volunteer], zoneStatuses, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.metadata?.['requestId']).toBe('r2');
  });
  it('returns empty array when no volunteers', () => {
    const tasks = generateAllEscortTasks([makeRequest()], [], zoneStatuses, NOW);
    expect(tasks).toHaveLength(0);
  });
});
