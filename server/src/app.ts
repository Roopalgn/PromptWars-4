/**
 * Express Application
 * Routes, middleware, security headers, rate limiting, Zod validation.
 *
 * API Routes:
 *   GET  /healthz              — health check (liveness probe)
 *   GET  /api/zones            — all zone statuses
 *   GET  /api/zones/:id        — single zone status
 *   GET  /api/tasks            — ranked task queue
 *   GET  /api/tasks/:id        — single task
 *   POST /api/escort           — create escort request
 *   GET  /api/escort           — list pending escorts
 *   POST /api/ask              — volunteer copilot (Gemini / offline)
 *   POST /api/fan/assist       — fan assistant (Gemini / offline)
 *   POST /api/tts              — Cloud TTS (text → base64 audio)
 *   GET  /api/simulation/tick  — advance simulation one tick (dev)
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { computeTaskQueue } from './rules/index.js';
import { tickSimulation, getSimulationState } from './simulation/tick.js';
import { sofiVenue } from './data/sofi-venue.js';
import { processWithGemini } from './agent/gemini.js';
import { processOfflineQuery } from './agent/offline.js';
import { createEscortRequest, getOperationalOutput, listEscortRequests, updateTaskLifecycle } from './state/operations.js';
import type { EscortRequest, TaskStatus } from './types/index.js';
import { randomUUID, timingSafeEqual } from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required: React style={{}} renders as HTML style="" attributes
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: process.env['ALLOWED_ORIGIN'] ?? ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '16kb' })); // limit body size to mitigate DoS

// ---------------------------------------------------------------------------
// Rate limiting (per-IP, separate limits for AI routes vs data routes)
// ---------------------------------------------------------------------------
const dataLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many AI requests — please wait.' } });

app.use('/api/zones', dataLimiter);
app.use('/api/tasks', dataLimiter);
app.use('/api/escort', dataLimiter);
app.use('/api/ask', aiLimiter);
app.use('/api/fan', aiLimiter);
app.use('/api/tts', aiLimiter);

// ---------------------------------------------------------------------------
// Input sanitizer — strips obvious HTML/script injection from string fields
// ---------------------------------------------------------------------------
function sanitize(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').trim().slice(0, 2000);
}

/** Optional operator guard. Set ADMIN_TOKEN in production to protect mutations. */
function adminGuard(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const expected = process.env['ADMIN_TOKEN'];
  if (!expected) { next(); return; }
  const supplied = req.header('x-admin-token') ?? req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!supplied) { res.status(401).json({ error: 'Admin token required' }); return; }
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    res.status(403).json({ error: 'Invalid admin token' }); return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Simulation state helper (singleton for this process)
// ---------------------------------------------------------------------------
async function getCurrentEngineOutput() {
  return getOperationalOutput();
}

function buildAiEvidence(output: Awaited<ReturnType<typeof getCurrentEngineOutput>>) {
  const topTasks = output.tasks.slice(0, 3);
  const criticalZones = output.zoneStatuses.filter(zone => zone.status === 'critical');
  return {
    factsUsed: [
      `${output.tasks.length} active task(s) in the deterministic queue`,
      `${criticalZones.length} critical zone(s): ${criticalZones.map(zone => zone.zoneId).join(', ') || 'none'}`,
      `${output.conflicts.length} conflict flag(s) from rules engine`,
    ],
    taskIds: topTasks.map(task => task.taskId),
    recommendedActions: topTasks.map(task => ({
      taskId: task.taskId,
      action: task.status === 'open' ? 'assign' : task.status === 'assigned' ? 'start' : 'monitor',
      rationale: task.reasoning,
    })),
  };
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
function sendHealth(res: express.Response) {
  const geminiMode = process.env['GEMINI_API_KEY'] ? 'online' : 'offline';
  const firestoreMode = process.env['GCP_PROJECT_ID'] ? 'connected' : 'memory';
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    gemini: geminiMode,
    firestore: firestoreMode,
  });
}

app.get('/healthz', (_req, res) => {
  sendHealth(res);
});

app.get('/api/healthz', (_req, res) => {
  sendHealth(res);
});

// ---------------------------------------------------------------------------
// Zone routes
// ---------------------------------------------------------------------------
app.get('/api/zones', dataLimiter, async (_req, res, next) => {
  try {
  const output = await getCurrentEngineOutput();
  res.json({ zones: output.zoneStatuses, tick: getSimulationState().tick });
  } catch (err) { next(err); }
});

app.get('/api/zones/:id', dataLimiter, async (req, res, next) => {
  try {
  const output = await getCurrentEngineOutput();
  const zone = output.zoneStatuses.find(z => z.zoneId === req.params['id']);
  if (!zone) { res.status(404).json({ error: 'Zone not found' }); return; }
  res.json(zone);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Task routes
// ---------------------------------------------------------------------------
const taskQuerySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

app.get('/api/tasks', dataLimiter, async (req, res, next) => {
  try {
  const parsed = taskQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { type, status, limit } = parsed.data;
  let tasks = (await getCurrentEngineOutput()).tasks;
  if (type) tasks = tasks.filter(t => t.type === type);
  if (status) tasks = tasks.filter(t => t.status === status);
  res.json({ tasks: tasks.slice(0, limit), total: tasks.length });
  } catch (err) { next(err); }
});

app.get('/api/tasks/:id', dataLimiter, async (req, res, next) => {
  try {
  const output = await getCurrentEngineOutput();
  const task = output.tasks.find(t => t.taskId === req.params['id']);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  res.json(task);
  } catch (err) { next(err); }
});

const taskUpdateSchema = z.object({
  status: z.enum(['open', 'assigned', 'in-progress', 'resolved']),
  assignedTo: z.string().min(1).max(64).optional(),
});

app.patch('/api/tasks/:id', dataLimiter, adminGuard, async (req, res, next) => {
  try {
    const rawTaskId = req.params['id'];
    const taskId = Array.isArray(rawTaskId) ? rawTaskId[0] : rawTaskId;
    if (!taskId) { res.status(400).json({ error: 'Task ID is required' }); return; }
    const parsed = taskUpdateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { status, assignedTo } = parsed.data;
    const updated = await updateTaskLifecycle(taskId, status as TaskStatus, assignedTo ? sanitize(assignedTo) : undefined);
    if (!updated) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(updated);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Escort routes
// ---------------------------------------------------------------------------
const escortCreateSchema = z.object({
  fanId: z.string().min(1).max(64),
  currentZone: z.string().min(1).max(64),
  destinationZone: z.string().min(1).max(64),
  needType: z.enum(['wheelchair', 'visual', 'hearing', 'elderly', 'cognitive']),
});

app.post('/api/escort', dataLimiter, adminGuard, async (req, res, next) => {
  try {
  const parsed = escortCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { fanId, currentZone, destinationZone, needType } = parsed.data;

  // Validate zone IDs against venue
  const validZoneIds = sofiVenue.zones.map(z => z.zoneId);
  if (!validZoneIds.includes(currentZone)) { res.status(400).json({ error: `Invalid currentZone: ${currentZone}` }); return; }
  if (!validZoneIds.includes(destinationZone)) { res.status(400).json({ error: `Invalid destinationZone: ${destinationZone}` }); return; }

  const request: EscortRequest = {
    requestId: randomUUID(),
    fanId: sanitize(fanId),
    currentZone,
    destinationZone,
    needType,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    waitingMinutes: 0,
  };
  await createEscortRequest(request);
  res.status(201).json(request);
  } catch (err) { next(err); }
});

app.get('/api/escort', dataLimiter, async (_req, res, next) => {
  try {
  const pending = await listEscortRequests();
  res.json({ requests: pending });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// AI Ask route (volunteer copilot)
// ---------------------------------------------------------------------------
const askSchema = z.object({
  query: z.string().min(1).max(500),
});

app.post('/api/ask', aiLimiter, async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const query = sanitize(parsed.data.query);
  const output = await getCurrentEngineOutput();
  const evidence = buildAiEvidence(output);

  try {
    const result = await processWithGemini(query, output);
    res.json({ response: result.response, offline: result.usedOffline, ...evidence });
  } catch {
    const response = processOfflineQuery(query, output, 'en');
    res.json({ response, offline: true, ...evidence });
  }
});

// ---------------------------------------------------------------------------
// Fan assistant route
// ---------------------------------------------------------------------------
const fanAssistSchema = z.object({
  query: z.string().min(1).max(500),
  language: z.string().max(8).optional().default('en'),
  needType: z.enum(['wheelchair', 'visual', 'hearing', 'elderly', 'cognitive', 'none']).optional(),
});

app.post('/api/fan/assist', aiLimiter, async (req, res) => {
  const parsed = fanAssistSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { language } = parsed.data;
  const query = sanitize(parsed.data.query) + (language !== 'en' ? ` (respond in language code: ${language})` : '');
  const output = await getCurrentEngineOutput();
  const evidence = buildAiEvidence(output);

  try {
    const result = await processWithGemini(query, output);
    res.json({ response: result.response, offline: result.usedOffline, language, ...evidence });
  } catch {
    const response = processOfflineQuery(query, output, language);
    res.json({ response, offline: true, language, ...evidence });
  }
});

// ---------------------------------------------------------------------------
// Cloud TTS route
// ---------------------------------------------------------------------------
const ttsSchema = z.object({
  text: z.string().min(1).max(500),
  languageCode: z.string().max(10).optional().default('en-US'),
  voiceName: z.string().max(50).optional(),
});

app.post('/api/tts', aiLimiter, async (req, res) => {
  const parsed = ttsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { text, languageCode, voiceName } = parsed.data;
  const safeText = sanitize(text);

  const hasGoogleCloudIdentity = Boolean(
    process.env['GCP_PROJECT_ID'] ??
    process.env['GOOGLE_CLOUD_PROJECT'] ??
    process.env['GOOGLE_APPLICATION_CREDENTIALS']
  );
  if (!hasGoogleCloudIdentity) {
    res.status(503).json({ error: 'TTS not available in offline mode', offline: true });
    return;
  }

  try {
    const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
    const client = new TextToSpeechClient();
    const ttsResponse = await client.synthesizeSpeech({
      input: { text: safeText },
      voice: { languageCode, name: voiceName ?? null, ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'MP3' },
    });
    const audio = ttsResponse[0]?.audioContent;
    if (!audio) throw new Error('No audio content returned');
    const b64 = Buffer.isBuffer(audio) ? audio.toString('base64') : Buffer.from(audio as Uint8Array).toString('base64');
    res.json({ audio: b64, format: 'mp3', languageCode });
  } catch {
    res.status(500).json({ error: 'TTS synthesis failed' });
  }
});

// ---------------------------------------------------------------------------
// Simulation tick route (dev / demo)
// ---------------------------------------------------------------------------
app.get('/api/simulation/tick', dataLimiter, adminGuard, (_req, res) => {
  const state = tickSimulation();
  const output = computeTaskQueue({ venue: sofiVenue, state });
  res.json({ tick: state.tick, tasks: output.tasks.length, zones: output.zoneStatuses.length });
});

// ---------------------------------------------------------------------------
// Static frontend serving / Dev landing / 404 + error handlers
// ---------------------------------------------------------------------------
const clientDistPath = path.resolve(__dirname, '../../client/dist');
const hasClientDist = fs.existsSync(clientDistPath);

if (hasClientDist) {
  app.use(express.static(clientDistPath));
  app.get('/*path', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/healthz') { next(); return; }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/*path', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/healthz') { next(); return; }
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>SoFi Stadium Copilot API Server</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; max-width: 500px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
          h1 { color: #a78bfa; margin-top: 0; }
          p { color: #cbd5e1; line-height: 1.6; }
          .btn-container { display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap; }
          a.btn { background: #6366f1; color: white; padding: 0.75rem 1.25rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; transition: background 0.2s; }
          a.btn:hover { background: #4f46e5; }
          a.btn-secondary { background: #334155; }
          a.btn-secondary:hover { background: #475569; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🏟️ SoFi Stadium Copilot API</h1>
          <p>The backend API server is running normally on port <strong>8080</strong>.</p>
          <p>To view the <strong>Frontend Web Application</strong> in development mode, please open the Vite client URL below:</p>
          <div class="btn-container">
            <a class="btn" href="http://localhost:5174/" target="_blank">Open Web App (5174)</a>
            <a class="btn btn-secondary" href="http://localhost:5173/" target="_blank">Open Web App (5173)</a>
            <a class="btn btn-secondary" href="/healthz">API Health Check</a>
          </div>
        </div>
      </body>
      </html>
    `);
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
