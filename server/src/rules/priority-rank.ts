/**
 * Rule 6: Priority Ranking
 *
 * Pure function — no I/O, no side effects.
 *
 * Sort order: priority ASC → type weight ASC → createdAt ASC
 *
 * Type weights (lower = higher priority):
 *   medical-response   = 1
 *   security-response  = 2
 *   escort             = 3
 *   crowd-reroute      = 4
 *   gate-rebalance     = 5
 *   facilities         = 6
 *
 * This is the tiebreak used when two tasks share the same numeric priority.
 * See §3.8 for the full cross-type ordering rationale.
 */
import type { Task, TaskType } from '../types/index.js';

export const TYPE_WEIGHTS: Record<TaskType, number> = {
  'medical-response': 1,
  'security-response': 2,
  'escort': 3,
  'crowd-reroute': 4,
  'gate-rebalance': 5,
  'facilities': 6,
} as const;

/**
 * Sort a list of tasks by priority (ascending), then type weight, then createdAt.
 * Returns a NEW array — does not mutate the input.
 */
export function rankTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // Primary: numeric priority (lower = more urgent)
    if (a.priority !== b.priority) return a.priority - b.priority;
    // Secondary: task type weight
    const wa = TYPE_WEIGHTS[a.type];
    const wb = TYPE_WEIGHTS[b.type];
    if (wa !== wb) return wa - wb;
    // Tertiary: creation time (earlier = higher priority)
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * Return the top N tasks after ranking.
 * Useful for the dashboard and API responses.
 */
export function getTopTasks(tasks: Task[], n = 10): Task[] {
  return rankTasks(tasks).slice(0, n);
}
