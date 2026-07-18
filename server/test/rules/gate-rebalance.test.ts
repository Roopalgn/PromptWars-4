import { describe, it, expect } from 'vitest';
import { computeGatePriority, generateGateRebalanceTask, generateAllGateRebalanceTasks } from '../../src/rules/gate-rebalance.js';
import type { GateDelaySignal } from '../../src/types/index.js';

const NOW = '2026-01-01T12:00:00Z';

function makeSignal(overrides: Partial<GateDelaySignal> = {}): GateDelaySignal {
  return { gateId: 'gate-b', delayMinutes: 12, cause: 'capacity', fanQueueCount: 300, updatedAt: NOW, ...overrides };
}

describe('computeGatePriority', () => {
  it('base 40 for exactly 5-min delay (no deduction)', () => {
    expect(computeGatePriority(5, 0)).toBe(40);
  });
  it('6-min delay: −2×1 = −2 → priority 38', () => {
    expect(computeGatePriority(6, 0)).toBe(38);
  });
  it('12-min delay, small queue: −2×7 = −14 → priority 26', () => {
    expect(computeGatePriority(12, 200)).toBe(26);
  });
  it('large queue deduction −5 applies when fanQueueCount > 500', () => {
    // 12-min: −14; queue >500: −5 → 40−19=21 → floor
    expect(computeGatePriority(12, 600)).toBe(21);
  });
  it('delay deduction capped at −20', () => {
    // 20-min: −2×15=−30 → capped −20 → 40−20=20 → floor=21
    expect(computeGatePriority(20, 0)).toBe(21);
  });
  it('floor = 21 for extreme inputs', () => {
    expect(computeGatePriority(999, 9999)).toBe(21);
  });
  it('invariant 1: gate floor (21) always > high incident (10)', () => {
    expect(computeGatePriority(999, 9999)).toBeGreaterThan(10);
  });
  it('invariant 2: gate floor (21) always > max-urgency escort (8)', () => {
    expect(computeGatePriority(999, 9999)).toBeGreaterThan(8);
  });
  it('invariant 8: severe gate (21) outranks medium incident (30)', () => {
    expect(computeGatePriority(999, 9999)).toBeLessThan(30);
  });
  it('queue deduction does NOT apply at exactly 500 fans', () => {
    // 6-min, exactly 500: no queue deduction → 38
    expect(computeGatePriority(6, 500)).toBe(38);
  });
});

describe('generateGateRebalanceTask', () => {
  it('returns null for delay ≤ 5 minutes', () => {
    expect(generateGateRebalanceTask(makeSignal({ delayMinutes: 5 }), [], NOW)).toBeNull();
    expect(generateGateRebalanceTask(makeSignal({ delayMinutes: 0 }), [], NOW)).toBeNull();
  });
  it('returns gate-rebalance task for delay > 5', () => {
    const task = generateGateRebalanceTask(makeSignal({ delayMinutes: 12 }), [], NOW);
    expect(task).not.toBeNull();
    expect(task!.type).toBe('gate-rebalance');
  });
  it('correct priority for 12-min, 600 fans (floor)', () => {
    const task = generateGateRebalanceTask(makeSignal({ delayMinutes: 12, fanQueueCount: 600 }), [], NOW);
    expect(task!.priority).toBe(21);
  });
  it('reasoning includes delay minutes', () => {
    const task = generateGateRebalanceTask(makeSignal({ delayMinutes: 8 }), [], NOW);
    expect(task!.reasoning).toContain('8min');
  });
  it('metadata includes delayMinutes, fanQueueCount, cause', () => {
    const task = generateGateRebalanceTask(makeSignal({ delayMinutes: 8, fanQueueCount: 200, cause: 'security' }), [], NOW);
    expect(task!.metadata?.['delayMinutes']).toBe(8);
    expect(task!.metadata?.['fanQueueCount']).toBe(200);
    expect(task!.metadata?.['cause']).toBe('security');
  });
  it('has open status and empty conflicts', () => {
    const task = generateGateRebalanceTask(makeSignal({ delayMinutes: 10 }), [], NOW);
    expect(task!.status).toBe('open');
    expect(task!.conflicts).toEqual([]);
  });
});

describe('generateAllGateRebalanceTasks', () => {
  it('generates task only for gates with delay > 5', () => {
    const signals: GateDelaySignal[] = [
      makeSignal({ gateId: 'gate-a', delayMinutes: 3 }),
      makeSignal({ gateId: 'gate-b', delayMinutes: 12 }),
    ];
    const tasks = generateAllGateRebalanceTasks(signals, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.zoneId).toBe('gate-b');
  });
  it('returns empty array when no gates exceed threshold', () => {
    expect(generateAllGateRebalanceTasks([makeSignal({ delayMinutes: 4 })], NOW)).toHaveLength(0);
  });
  it('generates tasks for multiple delayed gates', () => {
    const signals: GateDelaySignal[] = [
      makeSignal({ gateId: 'gate-a', delayMinutes: 10 }),
      makeSignal({ gateId: 'gate-b', delayMinutes: 15 }),
    ];
    expect(generateAllGateRebalanceTasks(signals, NOW)).toHaveLength(2);
  });
});
