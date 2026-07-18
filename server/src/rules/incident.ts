/**
 * Rule 5: Incident Escalation
 *
 * Pure function — no I/O, no side effects.
 *
 * Priority (fixed):
 *   high   = 10
 *   medium = 30
 *   low    = 60
 *
 * These values anchor the cross-type priority scale. See §3.8 and ADR-7.
 */
import { randomUUID } from 'crypto';
import type { IncidentReport, Task, IncidentSeverity } from '../types/index.js';
import { sofiVenue } from '../data/sofi-venue.js';

export const INCIDENT_PRIORITY: Record<IncidentSeverity, number> = {
  high: 10,
  medium: 30,
  low: 60,
} as const;

const ACTIONS: Record<IncidentReport['type'], Record<IncidentSeverity, string>> = {
  medical: {
    high: 'dispatch medical team immediately and clear area',
    medium: 'alert first-aid and monitor situation',
    low: 'log and assign volunteer to check on fan',
  },
  security: {
    high: 'contact security control and isolate area',
    medium: 'alert security patrol to zone',
    low: 'monitor and document',
  },
  facilities: {
    high: 'close zone and dispatch maintenance urgently',
    medium: 'dispatch facilities team',
    low: 'schedule maintenance check',
  },
  crowd: {
    high: 'activate emergency crowd control protocol',
    medium: 'deploy additional crowd management volunteers',
    low: 'monitor crowd density and prepare reroute',
  },
};

/**
 * Map incident type to task type.
 */
export function incidentTypeToTaskType(
  type: IncidentReport['type'],
): Task['type'] {
  switch (type) {
    case 'medical':
      return 'medical-response';
    case 'security':
      return 'security-response';
    case 'crowd':
      return 'crowd-reroute';
    case 'facilities':
    default:
      return 'facilities';
  }
}

/**
 * Generate a task from an incident report.
 * Only generates for open/responding incidents (not resolved).
 */
export function generateIncidentTask(
  incident: IncidentReport,
  now = new Date().toISOString(),
): Task | null {
  if (incident.status === 'resolved') return null;

  const priority = INCIDENT_PRIORITY[incident.severity];
  const taskType = incidentTypeToTaskType(incident.type);
  const action = ACTIONS[incident.type][incident.severity];

  const zone = sofiVenue.zones.find((z) => z.zoneId === incident.zone);
  const zoneName = zone?.name ?? incident.zone;

  const severityLabel = incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1);
  const typeLabel = incident.type.charAt(0).toUpperCase() + incident.type.slice(1);

  return {
    taskId: randomUUID(),
    priority,
    type: taskType,
    location: zoneName,
    zoneId: incident.zone,
    reasoning: `${severityLabel}-severity ${typeLabel} incident at ${zoneName} — ${action}`,
    status: 'open',
    conflicts: [],
    createdAt: now,
    metadata: {
      incidentId: incident.incidentId,
      incidentType: incident.type,
      severity: incident.severity,
      incidentStatus: incident.status,
    },
  };
}

/**
 * Generate tasks for all open/responding incidents.
 */
export function generateAllIncidentTasks(
  incidents: IncidentReport[],
  now?: string,
): Task[] {
  return incidents
    .map((i) => generateIncidentTask(i, now))
    .filter((t): t is Task => t !== null);
}
