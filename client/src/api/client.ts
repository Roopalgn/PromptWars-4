/**
 * API client — all server calls in one place.
 * BASE_URL defaults to the Vite proxy target.
 */
const BASE = import.meta.env['VITE_API_URL'] ?? '';

export interface ZoneStatus {
  zoneId: string;
  status: 'comfortable' | 'busy' | 'critical';
  occupancyPct: number;
  weatherAdjustedPct: number;
}

export interface Task {
  taskId: string;
  priority: number;
  type: string;
  location: string;
  zoneId: string;
  reasoning: string;
  status: string;
  assignedTo?: string;
  conflicts: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConflictFlag {
  conflictId: string;
  conflictType: string;
  taskA: string;
  taskB: string;
  description: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  zones: () => get<{ zones: ZoneStatus[]; tick: number }>('/api/zones'),
  tasks: (params?: { type?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    return get<{ tasks: Task[]; total: number }>(`/api/tasks?${qs}`);
  },
  task: (id: string) => get<Task>(`/api/tasks/${id}`),
  ask: (query: string) => post<{ response: string; offline: boolean }>('/api/ask', { query }),
  fanAssist: (query: string, language = 'en', needType?: string) =>
    post<{ response: string; offline: boolean; language: string }>('/api/fan/assist', { query, language, needType }),
  createEscort: (data: {
    fanId: string;
    currentZone: string;
    destinationZone: string;
    needType: string;
  }) => post<{ requestId: string }>('/api/escort', data),
  tts: (text: string, languageCode = 'en-US') =>
    post<{ audio: string; format: string }>('/api/tts', { text, languageCode }),
  tick: () => get<{ tick: number; tasks: number; zones: number }>('/api/simulation/tick'),
  healthz: () => get<{ status: string }>('/healthz'),
};
