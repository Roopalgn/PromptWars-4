import { createHash } from 'crypto';
import { dbGet, dbGetAll, dbSet } from '../firestore/client.js';
import { sofiVenue } from '../data/sofi-venue.js';
import { computeTaskQueue } from '../rules/index.js';
import { getSimulationState } from '../simulation/tick.js';
import type { EscortRequest, RulesEngineOutput, SimulationState, Task, TaskStatus } from '../types/index.js';

const ESCORTS = 'escort-requests';
const TASK_STATES = 'task-states';
const TASK_SNAPSHOTS = 'task-snapshots';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEscortRequest(value: unknown): value is EscortRequest {
  return isRecord(value) && typeof value['requestId'] === 'string';
}

function withAssignedTo<T extends Task | Record<string, unknown>>(value: T, assignedTo?: string): T {
  return assignedTo ? { ...value, assignedTo } : value;
}

function stableIdForTask(task: Task): string {
  const source =
    typeof task.metadata?.['requestId'] === 'string'
      ? `escort:${task.metadata['requestId']}`
      : typeof task.metadata?.['incidentId'] === 'string'
      ? `incident:${task.metadata['incidentId']}`
      : `${task.type}:${task.zoneId}:${task.reasoning}`;

  return createHash('sha1').update(source).digest('hex').slice(0, 16);
}

function minutesSince(isoDate: string, now: string): number {
  return Math.max(0, Math.floor((Date.parse(now) - Date.parse(isoDate)) / 60_000));
}

function seedDemoState(state: SimulationState): SimulationState {
  if (state.tick !== 0) return state;

  const now = state.timestamp;
  return {
    ...state,
    occupancySignals: state.occupancySignals.map(signal => {
      if (signal.zoneId === 'concourse-north') return { ...signal, occupancy: 94, trend: 'rising', updatedAt: now };
      if (signal.zoneId === 'gate-b') return { ...signal, occupancy: 88, trend: 'rising', updatedAt: now };
      return signal;
    }),
    gateDelaySignals: [
      {
        gateId: 'gate-b',
        delayMinutes: 17,
        cause: 'security',
        fanQueueCount: 720,
        updatedAt: now,
      },
    ],
    escortRequests: [
      {
        requestId: 'demo-wheelchair-escort',
        fanId: 'demo-fan-accessibility',
        currentZone: 'gate-a',
        destinationZone: 'section-100s',
        needType: 'wheelchair',
        status: 'pending',
        requestedAt: now,
        waitingMinutes: 12,
      },
    ],
    incidents: [
      {
        incidentId: 'demo-medical-100s',
        type: 'medical',
        zone: 'section-100s',
        severity: 'medium',
        status: 'open',
        reportedAt: now,
      },
    ],
  };
}

async function getPersistedEscorts(now: string): Promise<EscortRequest[]> {
  const docs = await dbGetAll(ESCORTS);
  return docs
    .filter(isEscortRequest)
    .filter(request => request.status === 'pending' || request.status === 'assigned' || request.status === 'in-progress')
    .map(request => ({
      ...request,
      waitingMinutes: Math.max(request.waitingMinutes, minutesSince(request.requestedAt, now)),
    }));
}

async function applyStoredTaskState(task: Task): Promise<Task | null> {
  const stored = await dbGet(TASK_STATES, task.taskId);
  if (!stored || typeof stored['status'] !== 'string') return task;
  if (stored['status'] === 'resolved') return null;
  const assignedTo = isRecord(stored) && typeof stored['assignedTo'] === 'string' ? stored['assignedTo'] : task.assignedTo;

  return withAssignedTo({
    ...task,
    status: stored['status'] as TaskStatus,
  }, assignedTo);
}

export async function createEscortRequest(request: EscortRequest): Promise<EscortRequest> {
  await dbSet(ESCORTS, request.requestId, request);
  return request;
}

export async function listEscortRequests(): Promise<EscortRequest[]> {
  const now = new Date().toISOString();
  return getPersistedEscorts(now);
}

export async function getOperationalOutput(): Promise<RulesEngineOutput> {
  const baseState = seedDemoState(getSimulationState());
  const persistedEscorts = await getPersistedEscorts(baseState.timestamp);
  const persistedIds = new Set(persistedEscorts.map(request => request.requestId));
  const state: SimulationState = {
    ...baseState,
    escortRequests: [
      ...baseState.escortRequests.filter(request => !persistedIds.has(request.requestId)),
      ...persistedEscorts,
    ],
  };

  const output = computeTaskQueue({ venue: sofiVenue, state });
  const tasks: Task[] = [];

  for (const task of output.tasks) {
    const stableTask = { ...task, taskId: stableIdForTask(task) };
    await dbSet(TASK_SNAPSHOTS, stableTask.taskId, stableTask);
    const visibleTask = await applyStoredTaskState(stableTask);
    if (visibleTask) tasks.push(visibleTask);
  }

  const idMap = new Map(output.tasks.map(task => [task.taskId, stableIdForTask(task)]));
  const conflicts = output.conflicts.map(conflict => ({
    ...conflict,
    taskA: idMap.get(conflict.taskA) ?? conflict.taskA,
    taskB: idMap.get(conflict.taskB) ?? conflict.taskB,
  }));

  return { zoneStatuses: output.zoneStatuses, tasks, conflicts };
}

export async function updateTaskLifecycle(
  taskId: string,
  status: TaskStatus,
  assignedTo?: string,
): Promise<Task | null> {
  const output = await getOperationalOutput();
  const current = output.tasks.find(task => task.taskId === taskId) ?? (await dbGet(TASK_SNAPSHOTS, taskId) as Task | null);
  if (!current) return null;

  const nextAssignedTo = assignedTo ?? current.assignedTo;
  await dbSet(TASK_STATES, taskId, withAssignedTo({
    taskId,
    status,
    updatedAt: new Date().toISOString(),
  }, nextAssignedTo));

  if (typeof current.metadata?.['requestId'] === 'string') {
    const escort = await dbGet(ESCORTS, current.metadata['requestId']);
    if (isEscortRequest(escort)) {
      const escortStatus = status === 'resolved' ? 'completed' : status === 'open' ? 'pending' : status;
      const nextEscort = nextAssignedTo ? {
        ...escort,
        status: escortStatus,
        assignedVolunteerId: nextAssignedTo,
      } : {
        ...escort,
        status: escortStatus,
      };
      await dbSet(ESCORTS, current.metadata['requestId'], nextEscort);
    }
  }

  return withAssignedTo({
    ...current,
    status,
  }, nextAssignedTo);
}
