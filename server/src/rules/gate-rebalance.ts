/**
 * Rule 4: Gate Rebalancing
 *
 * Pure function — no I/O, no side effects.
 *
 * Priority formula:
 *   Base: 40
 *   Deductions:
 *     delayMinutes > 5: -2 per minute above 5, capped at -20
 *     fanQueueCount > 500: -5
 *   Floor: max(21, ...) — gate tasks never outrank life-safety tasks
 *
 * Triggers if: delayMinutes > 5
 */
import { randomUUID } from 'crypto';
import type { GateDelaySignal, Task } from '../types/index.js';
import { sofiVenue } from '../data/sofi-venue.js';

const BASE_PRIORITY = 40;
const PRIORITY_FLOOR = 21;
const DELAY_DEDUCTION_PER_MINUTE = 2;
const MAX_DELAY_DEDUCTION = 20;
const LARGE_QUEUE_THRESHOLD = 500;
const LARGE_QUEUE_DEDUCTION = 5;
const TRIGGER_DELAY_MINUTES = 5;

/**
 * Compute priority for a gate delay signal.
 * Exported for unit testing.
 */
export function computeGatePriority(delayMinutes: number, fanQueueCount: number): number {
  const delayAboveThreshold = Math.max(0, delayMinutes - TRIGGER_DELAY_MINUTES);
  const delayDeduction = Math.min(
    delayAboveThreshold * DELAY_DEDUCTION_PER_MINUTE,
    MAX_DELAY_DEDUCTION,
  );
  const queueDeduction = fanQueueCount > LARGE_QUEUE_THRESHOLD ? LARGE_QUEUE_DEDUCTION : 0;

  return Math.max(PRIORITY_FLOOR, BASE_PRIORITY - delayDeduction - queueDeduction);
}

/**
 * Find the best alternate gate to divert fans to.
 * Prefers gates adjacent to this gate's concourse that are not themselves delayed.
 */
function findAlternateGate(
  gateId: string,
  delayedGateIds: Set<string>,
): string | null {
  const gate = sofiVenue.zones.find((z) => z.zoneId === gateId);
  if (!gate) return null;

  // All gates in the venue, excluding the current and other delayed gates
  const alternates = sofiVenue.zones
    .filter((z) => z.type === 'gate' && z.zoneId !== gateId && !delayedGateIds.has(z.zoneId))
    .sort((a, b) => {
      // Prefer gates adjacent to this one (i.e., sharing a concourse)
      const aShares = gate.adjacentZones.some((adj) =>
        a.adjacentZones.includes(adj),
      );
      const bShares = gate.adjacentZones.some((adj) =>
        b.adjacentZones.includes(adj),
      );
      if (aShares && !bShares) return -1;
      if (!aShares && bShares) return 1;
      return 0;
    });

  return alternates[0]?.name ?? null;
}

/**
 * Generate a gate-rebalance task for a delayed gate.
 * Returns null if the delay does not meet the trigger threshold.
 */
export function generateGateRebalanceTask(
  signal: GateDelaySignal,
  allSignals: GateDelaySignal[],
  now = new Date().toISOString(),
): Task | null {
  if (signal.delayMinutes <= TRIGGER_DELAY_MINUTES) return null;

  const priority = computeGatePriority(signal.delayMinutes, signal.fanQueueCount);

  const delayedGateIds = new Set(
    allSignals
      .filter((s) => s.delayMinutes > TRIGGER_DELAY_MINUTES)
      .map((s) => s.gateId),
  );

  const alternateName = findAlternateGate(signal.gateId, delayedGateIds);
  const queueNote =
    signal.fanQueueCount > 0 ? ` (${signal.fanQueueCount} fans queued)` : '';
  const altNote = alternateName ? ` — divert to ${alternateName}` : '';

  const gate = sofiVenue.zones.find((z) => z.zoneId === signal.gateId);
  const gateName = gate?.name ?? signal.gateId;

  return {
    taskId: randomUUID(),
    priority,
    type: 'gate-rebalance',
    location: gateName,
    zoneId: signal.gateId,
    reasoning: `${gateName} delayed ${signal.delayMinutes}min${queueNote}${altNote}`,
    status: 'open',
    conflicts: [],
    createdAt: now,
    metadata: {
      delayMinutes: signal.delayMinutes,
      fanQueueCount: signal.fanQueueCount,
      cause: signal.cause,
      alternateGateName: alternateName,
    },
  };
}

/**
 * Generate rebalance tasks for all delayed gates.
 */
export function generateAllGateRebalanceTasks(
  signals: GateDelaySignal[],
  now?: string,
): Task[] {
  return signals
    .map((s) => generateGateRebalanceTask(s, signals, now))
    .filter((t): t is Task => t !== null);
}
