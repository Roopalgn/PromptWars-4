/**
 * Rules Engine Entry Point
 *
 * Composes all rules into a single `computeTaskQueue` function.
 * Pure function — no I/O, no side effects.
 * Works with zero credentials (offline-safe by design).
 */
import type {
  RulesEngineInput,
  RulesEngineOutput,
  ZoneStatus,
  Task,
} from '../types/index.js';
import { classifyAllZones } from './zone-status.js';
import { generateAllRerouteTasks } from './reroute.js';
import { generateAllEscortTasks } from './escort-match.js';
import { generateAllGateRebalanceTasks } from './gate-rebalance.js';
import { generateAllIncidentTasks } from './incident.js';
import { rankTasks } from './priority-rank.js';
import { detectConflicts } from './conflict-detect.js';

/**
 * Core rules engine function.
 *
 * Fuses all live signals into a priority-ranked, explainable task queue.
 * Deterministic given the same inputs — identical inputs always produce
 * identical outputs (modulo UUID generation, which is injected in tests).
 *
 * @param input - Venue config + current simulation state
 * @returns Ranked tasks, zone statuses, and detected conflicts
 */
export function computeTaskQueue(input: RulesEngineInput): RulesEngineOutput {
  const { venue, state } = input;

  // Step 1: Classify zone statuses (weather-adjusted occupancy)
  const zoneStatuses: ZoneStatus[] = classifyAllZones(
    venue.zones,
    state.occupancySignals,
    state.weatherSignal,
  );

  // Step 2: Generate tasks from each signal type
  const now = state.timestamp;

  const rerouteTasks = generateAllRerouteTasks(venue.zones, zoneStatuses, now);
  const escortTasks = generateAllEscortTasks(
    state.escortRequests,
    state.volunteers,
    zoneStatuses,
    now,
  );
  const gateTasks = generateAllGateRebalanceTasks(state.gateDelaySignals, now);
  const incidentTasks = generateAllIncidentTasks(state.incidents, now);

  // Step 3: Combine all tasks
  const allTasks: Task[] = [
    ...rerouteTasks,
    ...escortTasks,
    ...gateTasks,
    ...incidentTasks,
  ];

  // Step 4: Detect conflicts (annotates Task.conflicts arrays in place)
  const conflicts = detectConflicts(allTasks);

  // Step 5: Rank all tasks
  const tasks = rankTasks(allTasks);

  return { zoneStatuses, tasks, conflicts };
}

// Re-export individual rules for direct use in API routes and tests
export { classifyZoneStatus, classifyAllZones, classifyLevel, THRESHOLDS } from './zone-status.js';
export { generateRerouteTask, generateAllRerouteTasks } from './reroute.js';
export { matchEscortToVolunteer, generateAllEscortTasks, computeEscortPriority } from './escort-match.js';
export { generateGateRebalanceTask, generateAllGateRebalanceTasks, computeGatePriority } from './gate-rebalance.js';
export { generateIncidentTask, generateAllIncidentTasks, INCIDENT_PRIORITY } from './incident.js';
export { rankTasks, getTopTasks, TYPE_WEIGHTS } from './priority-rank.js';
export { detectConflicts } from './conflict-detect.js';
