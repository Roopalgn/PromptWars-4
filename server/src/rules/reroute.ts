/**
 * Rule 2: Crowd Reroute
 *
 * Pure function — no I/O, no side effects.
 *
 * Priority formula: priority = 100 - adjustedPct
 *   Range: 0 (zone at 100%) to 14 (zone just over 85%).
 *   NO floor — crush-risk (>=93%) deliberately outranks max-urgency escort
 *   and high-severity incidents. See ADR-7.
 */
import { randomUUID } from 'crypto';
import type { Zone, ZoneStatus, Task } from '../types/index.js';
import { sofiVenue } from '../data/sofi-venue.js';

/**
 * Find the best alternative zone to redirect fans to.
 * Prefers adjacent zones of type 'concourse' or 'gate' that are not critical.
 */
function findAlternativeZone(
  zone: Zone,
  allStatuses: ZoneStatus[],
): Zone | undefined {
  const statusMap = new Map(allStatuses.map((s) => [s.zoneId, s]));

  // BFS one hop: prefer comfortable, then busy, skip critical
  const candidates = zone.adjacentZones
    .map((id) => sofiVenue.zones.find((z) => z.zoneId === id))
    .filter((z): z is Zone => z !== undefined && (z.type === 'concourse' || z.type === 'gate'))
    .filter((z) => {
      const status = statusMap.get(z.zoneId);
      return !status || status.status !== 'critical';
    })
    .sort((a, b) => {
      const sa = statusMap.get(a.zoneId)?.weatherAdjustedPct ?? 0;
      const sb = statusMap.get(b.zoneId)?.weatherAdjustedPct ?? 0;
      return sa - sb; // prefer least occupied
    });

  return candidates[0];
}

/**
 * Generate a crowd-reroute task for a critical zone.
 * Returns null if the zone is not critical or no alternate route is available.
 */
export function generateRerouteTask(
  zone: Zone,
  status: ZoneStatus,
  allStatuses: ZoneStatus[],
  now = new Date().toISOString(),
): Task | null {
  if (status.status !== 'critical') return null;

  const adjustedPct = status.weatherAdjustedPct;
  // priority = 100 - adjustedPct; range 0–14 for critical zones (>85%)
  const priority = Math.round(100 - adjustedPct);

  const alternative = findAlternativeZone(zone, allStatuses);
  const altName = alternative?.name ?? 'adjacent area';

  return {
    taskId: randomUUID(),
    priority,
    type: 'crowd-reroute',
    location: zone.name,
    zoneId: zone.zoneId,
    reasoning: `Zone "${zone.name}" at ${Math.round(adjustedPct)}% capacity — redirect incoming fans to ${altName}`,
    status: 'open',
    conflicts: [],
    createdAt: now,
    metadata: {
      adjustedPct,
      alternativeZoneId: alternative?.zoneId ?? null,
    },
  };
}

/**
 * Generate reroute tasks for ALL critical zones in the venue.
 */
export function generateAllRerouteTasks(
  zones: Zone[],
  statuses: ZoneStatus[],
  now?: string,
): Task[] {
  const statusMap = new Map(statuses.map((s) => [s.zoneId, s]));
  const tasks: Task[] = [];

  for (const zone of zones) {
    const status = statusMap.get(zone.zoneId);
    if (!status) continue;
    const task = generateRerouteTask(zone, status, statuses, now);
    if (task) tasks.push(task);
  }

  return tasks;
}
