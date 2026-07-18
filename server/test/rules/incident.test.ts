import { describe, it, expect } from 'vitest';
import { generateIncidentTask, generateAllIncidentTasks, INCIDENT_PRIORITY } from '../../src/rules/incident.js';
import type { IncidentReport } from '../../src/types/index.js';

const NOW = '2026-01-01T12:00:00Z';

function makeIncident(overrides: Partial<IncidentReport> = {}): IncidentReport {
  return {
    incidentId: 'inc-1', type: 'medical', zone: 'concourse-north',
    severity: 'high', status: 'open', reportedAt: NOW, ...overrides,
  };
}

describe('INCIDENT_PRIORITY constants', () => {
  it('high = 10', () => expect(INCIDENT_PRIORITY.high).toBe(10));
  it('medium = 30', () => expect(INCIDENT_PRIORITY.medium).toBe(30));
  it('low = 60', () => expect(INCIDENT_PRIORITY.low).toBe(60));
});

describe('generateIncidentTask', () => {
  it('returns null for resolved incidents', () => {
    expect(generateIncidentTask(makeIncident({ status: 'resolved' }), NOW)).toBeNull();
  });
  it('generates task for open incident', () => {
    const task = generateIncidentTask(makeIncident(), NOW);
    expect(task).not.toBeNull();
    expect(task!.type).toBe('medical-response');
    expect(task!.priority).toBe(10);
  });
  it('generates task for responding incident', () => {
    expect(generateIncidentTask(makeIncident({ status: 'responding' }), NOW)).not.toBeNull();
  });
  it('medical → medical-response', () => {
    expect(generateIncidentTask(makeIncident({ type: 'medical' }), NOW)!.type).toBe('medical-response');
  });
  it('security → security-response', () => {
    expect(generateIncidentTask(makeIncident({ type: 'security' }), NOW)!.type).toBe('security-response');
  });
  it('facilities → facilities', () => {
    expect(generateIncidentTask(makeIncident({ type: 'facilities' }), NOW)!.type).toBe('facilities');
  });
  it('crowd → crowd-reroute', () => {
    expect(generateIncidentTask(makeIncident({ type: 'crowd' }), NOW)!.type).toBe('crowd-reroute');
  });
  it('high severity priority = 10', () => {
    expect(generateIncidentTask(makeIncident({ severity: 'high' }), NOW)!.priority).toBe(10);
  });
  it('medium severity priority = 30', () => {
    expect(generateIncidentTask(makeIncident({ severity: 'medium' }), NOW)!.priority).toBe(30);
  });
  it('low severity priority = 60', () => {
    expect(generateIncidentTask(makeIncident({ severity: 'low' }), NOW)!.priority).toBe(60);
  });
  it('reasoning contains severity and type labels', () => {
    const task = generateIncidentTask(makeIncident(), NOW);
    expect(task!.reasoning).toContain('High');
    expect(task!.reasoning).toContain('Medical');
  });
  it('metadata contains incidentId and severity', () => {
    const task = generateIncidentTask(makeIncident({ incidentId: 'inc-xyz' }), NOW);
    expect(task!.metadata?.['incidentId']).toBe('inc-xyz');
    expect(task!.metadata?.['severity']).toBe('high');
  });
  it('task has open status and empty conflicts', () => {
    const task = generateIncidentTask(makeIncident(), NOW);
    expect(task!.status).toBe('open');
    expect(task!.conflicts).toEqual([]);
  });
});

describe('generateAllIncidentTasks', () => {
  it('skips resolved incidents', () => {
    const incidents: IncidentReport[] = [
      makeIncident({ incidentId: 'i1', status: 'open' }),
      makeIncident({ incidentId: 'i2', status: 'resolved' }),
    ];
    const tasks = generateAllIncidentTasks(incidents, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.metadata?.['incidentId']).toBe('i1');
  });
  it('returns empty for all resolved', () => {
    expect(generateAllIncidentTasks([makeIncident({ status: 'resolved' })], NOW)).toHaveLength(0);
  });
  it('handles multiple open incidents', () => {
    const incidents: IncidentReport[] = [
      makeIncident({ incidentId: 'i1', severity: 'high' }),
      makeIncident({ incidentId: 'i2', severity: 'low', type: 'security' }),
    ];
    expect(generateAllIncidentTasks(incidents, NOW)).toHaveLength(2);
  });
});
