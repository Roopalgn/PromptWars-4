/**
 * Rule 3: Escort Matching
 *
 * Pure function — no I/O, no side effects.
 *
 * Priority formula:
 *   Base: 20
 *   Deductions (stack independently):
 *     wheelchair|visual:  -4
 *     elderly|cognitive:  -3
 *     hearing:             0  (intentional — urgency determined by wait time only)
 *     waitingMinutes > 10: -5
 *     waitingMinutes > 20: -3 (stacks with >10 deduction; 25 min => -8 total)
 *   Floor: max(8, ...) — matches actual maximum deduction of -12
 *
 * See ADR-7 for cross-type priority ordering decisions.
 */
import { randomUUID } from 'crypto';
import type { EscortRequest, Volunteer, ZoneStatus, Task, NeedType } from '../types/index.js';
import { findAccessiblePath, findShortestPath } from '../data/sofi-venue.js';

const BASE_PRIORITY = 20;
const PRIORITY_FLOOR = 8;

/** Deduction amounts by needType. */
const NEED_TYPE_DEDUCTIONS: Record<NeedType, number> = {
  wheelchair: 4,
  visual: 4,
  elderly: 3,
  cognitive: 3,
  hearing: 0,
};

/**
 * Compute the numeric priority for an escort request.
 * Exported so it can be unit-tested directly.
 */
export function computeEscortPriority(request: Pick<EscortRequest, 'needType' | 'waitingMinutes'>): number {
  let deduction = NEED_TYPE_DEDUCTIONS[request.needType];

  if (request.waitingMinutes > 10) deduction += 5;
  if (request.waitingMinutes > 20) deduction += 3; // stacks with >10

  return Math.max(PRIORITY_FLOOR, BASE_PRIORITY - deduction);
}

/**
 * Whether this needType requires step-free (accessible) routing.
 */
export function requiresAccessibleRoute(needType: NeedType): boolean {
  return needType === 'wheelchair' || needType === 'visual';
}

/**
 * Find the nearest available volunteer to a given zone using BFS.
 * Returns null if no volunteer is available.
 */
export function findNearestVolunteer(
  fromZoneId: string,
  volunteers: Volunteer[],
  zoneStatuses: ZoneStatus[],
  excludeTaskId?: string,
): Volunteer | null {
  const available = volunteers.filter(
    (v) =>
      v.status === 'available' &&
      (!excludeTaskId || v.assignedTaskId !== excludeTaskId),
  );

  if (available.length === 0) return null;

  // Sort by hop distance from fromZoneId
  const statusMap = new Map(zoneStatuses.map((s) => [s.zoneId, s]));

  // BFS to compute distances
  const distances = new Map<string, number>();
  const queue: Array<{ zoneId: string; dist: number }> = [
    { zoneId: fromZoneId, dist: 0 },
  ];
  distances.set(fromZoneId, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const zone = sofiZoneMap.get(current.zoneId);
    if (!zone) continue;
    for (const neighborId of zone.adjacentZones) {
      if (!distances.has(neighborId)) {
        distances.set(neighborId, current.dist + 1);
        queue.push({ zoneId: neighborId, dist: current.dist + 1 });
      }
    }
  }

  // Prefer volunteers in comfortable zones, then by distance
  const scored = available.map((v) => ({
    volunteer: v,
    dist: distances.get(v.currentZone) ?? 999,
    isComfortable: statusMap.get(v.currentZone)?.status === 'comfortable',
  }));

  scored.sort((a, b) => {
    // Comfortable zones first
    if (a.isComfortable !== b.isComfortable) return a.isComfortable ? -1 : 1;
    return a.dist - b.dist;
  });

  return scored[0]?.volunteer ?? null;
}

// Lazy zone map import (avoids circular dependency)
import { sofiVenue } from '../data/sofi-venue.js';
const sofiZoneMap = new Map(sofiVenue.zones.map((z) => [z.zoneId, z]));

/**
 * Match an escort request to the nearest available volunteer and produce a Task.
 * Returns null if no volunteer is available.
 */
export function matchEscortToVolunteer(
  request: EscortRequest,
  volunteers: Volunteer[],
  zoneStatuses: ZoneStatus[],
  now = new Date().toISOString(),
): Task | null {
  if (request.status !== 'pending') return null;

  const priority = computeEscortPriority(request);
  const needsAccessible = requiresAccessibleRoute(request.needType);

  const volunteer = findNearestVolunteer(request.currentZone, volunteers, zoneStatuses);
  if (!volunteer) return null;

  // Determine route
  const path = needsAccessible
    ? findAccessiblePath(request.currentZone, request.destinationZone)
    : findShortestPath(request.currentZone, request.destinationZone);

  const needLabel = request.needType.charAt(0).toUpperCase() + request.needType.slice(1);
  const routeNote = needsAccessible ? ' (step-free route)' : '';
  const waitNote = request.waitingMinutes > 0 ? `, waiting ${request.waitingMinutes}min` : '';

  return {
    taskId: randomUUID(),
    priority,
    type: 'escort',
    location: sofiZoneMap.get(request.currentZone)?.name ?? request.currentZone,
    zoneId: request.currentZone,
    reasoning: `${needLabel} escort needed${waitNote} — assign ${volunteer.name} (${routeNote ? 'accessible route' : 'standard route'})${routeNote}`,
    status: volunteer ? 'assigned' : 'open',
    assignedTo: volunteer.volunteerId,
    conflicts: [],
    createdAt: now,
    metadata: {
      requestId: request.requestId,
      needType: request.needType,
      waitingMinutes: request.waitingMinutes,
      volunteerId: volunteer.volunteerId,
      routePath: path,
      requiresAccessibleRoute: needsAccessible,
    },
  };
}

/**
 * Generate escort tasks for all pending escort requests.
 */
export function generateAllEscortTasks(
  requests: EscortRequest[],
  volunteers: Volunteer[],
  zoneStatuses: ZoneStatus[],
  now?: string,
): Task[] {
  const tasks: Task[] = [];
  // Track used volunteers to prevent double-assignment within one tick
  const usedVolunteerIds = new Set<string>();

  // Process highest-priority requests first
  const sorted = [...requests]
    .filter((r) => r.status === 'pending')
    .sort((a, b) => computeEscortPriority(a) - computeEscortPriority(b));

  for (const request of sorted) {
    const availableVolunteers = volunteers.filter(
      (v) => !usedVolunteerIds.has(v.volunteerId),
    );
    const task = matchEscortToVolunteer(request, availableVolunteers, zoneStatuses, now);
    if (task) {
      tasks.push(task);
      if (task.assignedTo) usedVolunteerIds.add(task.assignedTo);
    }
  }

  return tasks;
}
