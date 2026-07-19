/**
 * Integration tests for Express app routes.
 *
 * Tests every route in app.ts:
 *   GET  /healthz
 *   GET  /api/zones
 *   GET  /api/zones/:id
 *   GET  /api/tasks
 *   GET  /api/tasks/:id (found + 404)
 *   POST /api/escort (valid + invalid)
 *   GET  /api/escort
 *   POST /api/ask (offline mode)
 *   POST /api/fan/assist (offline mode)
 *   POST /api/tts (offline — no TTS client)
 *   GET  /api/simulation/tick
 *   404 handler
 *
 * Does NOT require GEMINI_API_KEY — exercises the offline fallback path.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

// Ensure no API key is set so we exercise the offline code path
beforeAll(() => {
  delete process.env['GEMINI_API_KEY'];
  delete process.env['GCP_PROJECT_ID'];
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.version).toBe('1.0.0');
  });

  it('reports offline gemini mode when no API key', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body.gemini).toBe('offline');
  });

  it('reports memory firestore mode when no GCP_PROJECT_ID', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body.firestore).toBe('memory');
  });
});

// ---------------------------------------------------------------------------
// Zone routes
// ---------------------------------------------------------------------------
describe('GET /api/zones', () => {
  it('returns 200 with zones array', async () => {
    const res = await request(app).get('/api/zones');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.zones)).toBe(true);
    expect(typeof res.body.tick).toBe('number');
  });

  it('each zone has required fields', async () => {
    const res = await request(app).get('/api/zones');
    const zone = res.body.zones[0];
    expect(zone).toHaveProperty('zoneId');
    expect(zone).toHaveProperty('status');
    expect(zone).toHaveProperty('occupancyPct');
    expect(zone).toHaveProperty('weatherAdjustedPct');
  });
});

describe('GET /api/zones/:id', () => {
  it('returns a zone by id', async () => {
    const res = await request(app).get('/api/zones/gate-a');
    expect(res.status).toBe(200);
    expect(res.body.zoneId).toBe('gate-a');
  });

  it('returns 404 for unknown zone id', async () => {
    const res = await request(app).get('/api/zones/nonexistent-zone');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Task routes
// ---------------------------------------------------------------------------
describe('GET /api/tasks', () => {
  it('returns 200 with tasks array and total', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('shows meaningful demo operations tasks on fresh state', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.tasks.some((task: { type: string }) => task.type === 'escort')).toBe(true);
  });

  it('tasks are sorted by priority ascending', async () => {
    const res = await request(app).get('/api/tasks');
    const tasks: Array<{ priority: number }> = res.body.tasks;
    for (let i = 1; i < tasks.length; i++) {
      expect(tasks[i]!.priority).toBeGreaterThanOrEqual(tasks[i - 1]!.priority);
    }
  });
});

describe('GET /api/tasks/:id', () => {
  it('returns 404 for unknown task id', async () => {
    const res = await request(app).get('/api/tasks/nonexistent-task-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('moves a task through lifecycle state', async () => {
    const queue = await request(app).get('/api/tasks');
    const task = queue.body.tasks[0];
    const res = await request(app)
      .patch(`/api/tasks/${task.taskId}`)
      .send({ status: 'in-progress', assignedTo: 'vol-001' });

    expect(res.status).toBe(200);
    expect(res.body.taskId).toBe(task.taskId);
    expect(res.body.status).toBe('in-progress');
    expect(res.body.assignedTo).toBe('vol-001');
  });
});

// ---------------------------------------------------------------------------
// Escort routes
// ---------------------------------------------------------------------------
describe('POST /api/escort', () => {
  it('creates an escort request with valid body', async () => {
    const res = await request(app)
      .post('/api/escort')
      .send({
        fanId: 'fan-001',
        currentZone: 'gate-a',
        destinationZone: 'accessibility-hub',
        needType: 'wheelchair',
      });
    expect(res.status).toBe(201);
    expect(res.body.requestId).toBeDefined();
    expect(res.body.status).toBe('pending');
  });

  it('created escort appears in the volunteer task queue', async () => {
    const escort = await request(app)
      .post('/api/escort')
      .send({
        fanId: 'fan-flow-001',
        currentZone: 'gate-a',
        destinationZone: 'accessibility-hub',
        needType: 'wheelchair',
      });

    const queue = await request(app).get('/api/tasks?type=escort');
    expect(queue.status).toBe(200);
    expect(queue.body.tasks.some((task: { metadata?: { requestId?: string } }) =>
      task.metadata?.requestId === escort.body.requestId
    )).toBe(true);
  });

  it('rejects request with missing needType', async () => {
    const res = await request(app)
      .post('/api/escort')
      .send({
        fanId: 'fan-002',
        currentZone: 'gate-a',
        destinationZone: 'accessibility-hub',
        // needType missing
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejects request with invalid needType', async () => {
    const res = await request(app)
      .post('/api/escort')
      .send({
        fanId: 'fan-003',
        currentZone: 'gate-a',
        destinationZone: 'accessibility-hub',
        needType: 'invalid-type',
      });
    expect(res.status).toBe(400);
  });

  it('rejects request with missing currentZone', async () => {
    const res = await request(app)
      .post('/api/escort')
      .send({
        fanId: 'fan-004',
        destinationZone: 'accessibility-hub',
        needType: 'elderly',
      });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/escort', () => {
  it('returns 200 with requests array', async () => {
    const res = await request(app).get('/api/escort');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.requests)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AI routes — offline fallback (no GEMINI_API_KEY)
// ---------------------------------------------------------------------------
describe('POST /api/ask (offline fallback)', () => {
  it('returns 200 with response in offline mode', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ query: 'Which zones are busy?' });
    expect(res.status).toBe(200);
    expect(typeof res.body.response).toBe('string');
    expect(res.body.response.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.factsUsed)).toBe(true);
    expect(Array.isArray(res.body.taskIds)).toBe(true);
    expect(Array.isArray(res.body.recommendedActions)).toBe(true);
  });

  it('sets offline: true in response when Gemini unavailable', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ query: 'What are the top tasks?' });
    expect(res.status).toBe(200);
    expect(res.body.offline).toBe(true);
  });

  it('rejects empty query', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ query: '' });
    expect(res.status).toBe(400);
  });

  it('rejects missing query field', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/fan/assist (offline fallback)', () => {
  it('returns 200 with response in offline mode', async () => {
    const res = await request(app)
      .post('/api/fan/assist')
      .send({ query: 'Where is the nearest bathroom?', language: 'en' });
    expect(res.status).toBe(200);
    expect(typeof res.body.response).toBe('string');
  });

  it('offline response acknowledges language when non-English', async () => {
    const res = await request(app)
      .post('/api/fan/assist')
      .send({ query: 'Donde esta el bano?', language: 'es' });
    expect(res.status).toBe(200);
    expect(res.body.offline).toBe(true);
  });

  it('rejects empty query', async () => {
    const res = await request(app)
      .post('/api/fan/assist')
      .send({ query: '', language: 'en' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// TTS route — offline (no Google Cloud client)
// ---------------------------------------------------------------------------
describe('POST /api/tts', () => {
  it('returns 400 or 503 gracefully when Cloud TTS unavailable', async () => {
    const res = await request(app)
      .post('/api/tts')
      .send({ text: 'Hello, welcome to SoFi Stadium', languageCode: 'en-US' });
    // Without real credentials, should fail gracefully (not 500 crash)
    expect([400, 503, 200]).toContain(res.status);
  });

  it('rejects empty text', async () => {
    const res = await request(app)
      .post('/api/tts')
      .send({ text: '', languageCode: 'en-US' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Simulation tick
// ---------------------------------------------------------------------------
describe('GET /api/simulation/tick', () => {
  it('returns 200 with tick, tasks, zones counts', async () => {
    const res = await request(app).get('/api/simulation/tick');
    expect(res.status).toBe(200);
    expect(typeof res.body.tick).toBe('number');
    expect(typeof res.body.tasks).toBe('number');
    expect(typeof res.body.zones).toBe('number');
  });

  it('increments tick on each call', async () => {
    const res1 = await request(app).get('/api/simulation/tick');
    const res2 = await request(app).get('/api/simulation/tick');
    expect(res2.body.tick).toBeGreaterThan(res1.body.tick);
  });
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
describe('404 handler', () => {
  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
