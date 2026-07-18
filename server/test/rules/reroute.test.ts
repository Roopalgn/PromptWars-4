import { describe, it, expect } from 'vitest';
import { generateRerouteTask, generateAllRerouteTasks } from '../../src/rules/reroute.js';
import type { Zone, ZoneStatus } from '../../src/types/index.js';

const NOW = '2026-01-01T12:00:00Z';

const zone: Zone = {
  zoneId: 'concourse-north', name: 'North Concourse', type: 'concourse',
  capacity: 12000, currentOccupancy: 11040,
  accessibleRoutes: ['gate-a'], adjacentZones: ['gate-a', 'gate-b'],
  coordinates: { x: 50, y: 20 },
};

const criticalStatus: ZoneStatus = {
  zoneId: 'concourse-north', status: 'critical', occupancyPct: 92, weatherAdjustedPct: 92,
};
const busyStatus: ZoneStatus = {
  zoneId: 'concourse-north', status: 'busy', occupancyPct: 75, weatherAdjustedPct: 75,
};
const comfortableGateStatus: ZoneStatus = {
  zoneId: 'gate-a', status: 'comfortable', occupancyPct: 40, weatherAdjustedPct: 40,
};

describe('generateRerouteTask', () => {
  it('returns null for a busy (non-critical) zone', () => {
    expect(generateRerouteTask(zone, busyStatus, [busyStatus], NOW)).toBeNull();
  });

  it('returns null for comfortable zone', () => {
    const comfortZone = { ...zone, zoneId: 'gate-a' };
    const comfortStatus: ZoneStatus = { zoneId: 'gate-a', status: 'comfortable', occupancyPct: 40, weatherAdjustedPct: 40 };
    expect(generateRerouteTask(comfortZone, comfortStatus, [comfortStatus], NOW)).toBeNull();
  });

  it('returns a crowd-reroute task for critical zone', () => {
    const task = generateRerouteTask(zone, criticalStatus, [criticalStatus, comfortableGateStatus], NOW);
    expect(task).not.toBeNull();
    expect(task!.type).toBe('crowd-reroute');
  });

  it('priority = 100 − adjustedPct (92% → 8)', () => {
    const task = generateRerouteTask(zone, criticalStatus, [criticalStatus], NOW);
    expect(task!.priority).toBe(8);
  });

  it('priority = 0 for zone at 100% (ADR-7 — no floor, crush risk)', () => {
    const s: ZoneStatus = { ...criticalStatus, weatherAdjustedPct: 100 };
    expect(generateRerouteTask(zone, s, [s], NOW)!.priority).toBe(0);
  });

  it('priority = 14 for zone at 86% (just over critical threshold)', () => {
    const s: ZoneStatus = { ...criticalStatus, weatherAdjustedPct: 86 };
    expect(generateRerouteTask(zone, s, [s], NOW)!.priority).toBe(14);
  });

  it('reroute at priority 7 (93%) outranks max-urgency escort (8) — ADR-7 extension', () => {
    const s: ZoneStatus = { ...criticalStatus, weatherAdjustedPct: 93 };
    const task = generateRerouteTask(zone, s, [s], NOW);
    expect(task!.priority).toBe(7); // 7 < 8 → reroute wins
  });

  it('reasoning contains zone name and adjusted percentage', () => {
    const task = generateRerouteTask(zone, criticalStatus, [criticalStatus, comfortableGateStatus], NOW);
    expect(task!.reasoning).toContain('North Concourse');
    expect(task!.reasoning).toContain('92%');
  });

  it('metadata contains adjustedPct', () => {
    const task = generateRerouteTask(zone, criticalStatus, [criticalStatus, comfortableGateStatus], NOW);
    expect(task!.metadata?.['adjustedPct']).toBe(92);
  });

  it('task has open status and empty conflicts', () => {
    const task = generateRerouteTask(zone, criticalStatus, [criticalStatus, comfortableGateStatus], NOW);
    expect(task!.status).toBe('open');
    expect(task!.conflicts).toEqual([]);
  });

  it('task has unique taskId (UUID format)', () => {
    const task = generateRerouteTask(zone, criticalStatus, [criticalStatus], NOW);
    expect(task!.taskId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('generateAllRerouteTasks', () => {
  const zones: Zone[] = [
    zone,
    { ...zone, zoneId: 'gate-a', name: 'Gate A', type: 'gate', adjacentZones: ['concourse-north'] },
  ];

  it('generates tasks only for critical zones', () => {
    const statuses: ZoneStatus[] = [criticalStatus, comfortableGateStatus];
    const tasks = generateAllRerouteTasks(zones, statuses, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.zoneId).toBe('concourse-north');
  });

  it('returns empty array when no zones critical', () => {
    const statuses: ZoneStatus[] = [
      { ...busyStatus, zoneId: 'concourse-north' },
      comfortableGateStatus,
    ];
    expect(generateAllRerouteTasks(zones, statuses, NOW)).toHaveLength(0);
  });

  it('generates tasks for multiple critical zones', () => {
    const statuses: ZoneStatus[] = [
      criticalStatus,
      { zoneId: 'gate-a', status: 'critical', occupancyPct: 88, weatherAdjustedPct: 88 },
    ];
    const tasks = generateAllRerouteTasks(zones, statuses, NOW);
    expect(tasks).toHaveLength(2);
  });
});
