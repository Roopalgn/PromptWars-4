/**
 * Rule 7: Conflict Detection
 *
 * Pure function — no I/O, no side effects.
 *
 * Detects three conflict types:
 *   same-volunteer:      two tasks assigned to the same volunteer
 *   route-collision:     two reroute tasks directing fans to the same already-busy zone
 *   competing-reroute:   a reroute task overlaps with an active escort path
 */
import { randomUUID } from 'crypto';
import type { Task, ConflictFlag } from '../types/index.js';

/**
 * Detect tasks double-assigned to the same volunteer.
 */
export function detectSameVolunteerConflicts(tasks: Task[]): ConflictFlag[] {
  const assignedTasks = tasks.filter((t) => t.assignedTo !== undefined);
  const byVolunteer = new Map<string, Task[]>();

  for (const task of assignedTasks) {
    const vid = task.assignedTo!;
    const existing = byVolunteer.get(vid) ?? [];
    existing.push(task);
    byVolunteer.set(vid, existing);
  }

  const flags: ConflictFlag[] = [];

  for (const [, volunteeTasks] of byVolunteer) {
    if (volunteeTasks.length < 2) continue;
    // Flag each pair
    for (let i = 0; i < volunteeTasks.length; i++) {
      for (let j = i + 1; j < volunteeTasks.length; j++) {
        const a = volunteeTasks[i]!;
        const b = volunteeTasks[j]!;
        flags.push({
          conflictId: randomUUID(),
          taskA: a.taskId,
          taskB: b.taskId,
          conflictType: 'same-volunteer',
          resolution: `Un-assign ${a.assignedTo} from lower-priority task (${b.priority > a.priority ? b.taskId : a.taskId})`,
        });
      }
    }
  }

  return flags;
}

/**
 * Detect two reroute tasks that both direct fans to the same destination zone,
 * and that destination is itself busy or critical.
 */
export function detectRouteCollisions(tasks: Task[]): ConflictFlag[] {
  const rerouteTasks = tasks.filter((t) => t.type === 'crowd-reroute');
  const destinationCount = new Map<string, Task[]>();

  for (const task of rerouteTasks) {
    const dest = task.metadata?.['alternativeZoneId'] as string | undefined;
    if (!dest) continue;
    const existing = destinationCount.get(dest) ?? [];
    existing.push(task);
    destinationCount.set(dest, existing);
  }

  const flags: ConflictFlag[] = [];

  for (const [destZoneId, routeTasks] of destinationCount) {
    if (routeTasks.length < 2) continue;
    for (let i = 0; i < routeTasks.length; i++) {
      for (let j = i + 1; j < routeTasks.length; j++) {
        const a = routeTasks[i]!;
        const b = routeTasks[j]!;
        flags.push({
          conflictId: randomUUID(),
          taskA: a.taskId,
          taskB: b.taskId,
          conflictType: 'route-collision',
          resolution: `Both reroutes direct fans to "${destZoneId}" — redirect one to a different zone`,
        });
      }
    }
  }

  return flags;
}

/**
 * Detect reroute tasks that overlap with escort task destination zones.
 * A competing-reroute conflict occurs when a reroute sends fans through
 * a zone that an escort task is actively traversing.
 */
export function detectCompetingReroutes(tasks: Task[]): ConflictFlag[] {
  const rerouteTasks = tasks.filter((t) => t.type === 'crowd-reroute');
  const escortTasks = tasks.filter((t) => t.type === 'escort');

  const flags: ConflictFlag[] = [];

  for (const reroute of rerouteTasks) {
    const rerouteZone = reroute.zoneId;
    const rerouteAlt = reroute.metadata?.['alternativeZoneId'] as string | undefined;

    for (const escort of escortTasks) {
      const escortPath = escort.metadata?.['routePath'] as string[] | undefined;
      if (!escortPath) continue;

      // Conflict if reroute destination is on the escort's path
      if (rerouteAlt && escortPath.includes(rerouteAlt)) {
        flags.push({
          conflictId: randomUUID(),
          taskA: reroute.taskId,
          taskB: escort.taskId,
          conflictType: 'competing-reroute',
          resolution: `Reroute destination conflicts with escort path — delay reroute or use alternate destination`,
        });
      } else if (escortPath.includes(rerouteZone)) {
        // Reroute source zone is on the escort path
        flags.push({
          conflictId: randomUUID(),
          taskA: reroute.taskId,
          taskB: escort.taskId,
          conflictType: 'competing-reroute',
          resolution: `Crowd reroute at "${rerouteZone}" conflicts with active escort path — coordinate timing`,
        });
      }
    }
  }

  return flags;
}

/**
 * Run all conflict detection rules and return all flags.
 * Also annotates Task.conflicts arrays in place.
 */
export function detectConflicts(tasks: Task[]): ConflictFlag[] {
  const flags = [
    ...detectSameVolunteerConflicts(tasks),
    ...detectRouteCollisions(tasks),
    ...detectCompetingReroutes(tasks),
  ];

  // Annotate tasks with their conflict IDs
  for (const flag of flags) {
    const taskA = tasks.find((t) => t.taskId === flag.taskA);
    const taskB = tasks.find((t) => t.taskId === flag.taskB);
    if (taskA && !taskA.conflicts.includes(flag.conflictId)) taskA.conflicts.push(flag.conflictId);
    if (taskB && !taskB.conflicts.includes(flag.conflictId)) taskB.conflicts.push(flag.conflictId);
  }

  return flags;
}
