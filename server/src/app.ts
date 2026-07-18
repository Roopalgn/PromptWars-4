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
import type { EscortRequest, SimulationState } from './types/index.js';
import { randomUUID } from 'crypto';

const app = express();

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
  methods: ['GET', 'POST'],
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

// ---------------------------------------------------------------------------
// Simulation state helper (singleton for this process)
// ---------------------------------------------------------------------------
function getCurrentEngineOutput() {
  const state: SimulationState = getSimulationState();
  return computeTaskQueue({ venue: sofiVenue, state });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/healthz', (_req, res) => {
  const geminiMode = process.env['GEMINI_API_KEY'] ? 'online' : 'offline';
  const firestoreMode = process.env['GCP_PROJECT_ID'] ? 'connected' : 'memory';
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    gemini: geminiMode,
    firestore: firestoreMode,
  });
});

// ---------------------------------------------------------------------------
// Zone routes
// ---------------------------------------------------------------------------
app.get('/api/zones', dataLimiter, (_req, res) => {
  const output = getCurrentEngineOutput();
  res.json({ zones: output.zoneStatuses, tick: getSimulationState().tick });
});

app.get('/api/zones/:id', dataLimiter, (req, res) => {
  const output = getCurrentEngineOutput();
  const zone = output.zoneStatuses.find(z => z.zoneId === req.params['id']);
  if (!zone) { res.status(404).json({ error: 'Zone not found' }); return; }
  res.json(zone);
});

// ---------------------------------------------------------------------------
// Task routes
// ---------------------------------------------------------------------------
const taskQuerySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

app.get('/api/tasks', dataLimiter, (req, res) => {
  const parsed = taskQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { type, status, limit } = parsed.data;
  let tasks = getCurrentEngineOutput().tasks;
  if (type) tasks = tasks.filter(t => t.type === type);
  if (status) tasks = tasks.filter(t => t.status === status);
  res.json({ tasks: tasks.slice(0, limit), total: tasks.length });
});

app.get('/api/tasks/:id', dataLimiter, (req, res) => {
  const output = getCurrentEngineOutput();
  const task = output.tasks.find(t => t.taskId === req.params['id']);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  res.json(task);
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

// In-memory escort request store (replaced by Firestore in Phase 4)
const escortRequests: EscortRequest[] = [];

app.post('/api/escort', dataLimiter, (req, res) => {
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
  escortRequests.push(request);
  res.status(201).json(request);
});

app.get('/api/escort', dataLimiter, (_req, res) => {
  const pending = escortRequests.filter(r => r.status === 'pending' || r.status === 'in-progress');
  res.json({ requests: pending });
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
  const output = getCurrentEngineOutput();

  try {
    const result = await processWithGemini(query, output);
    res.json({ response: result.response, offline: result.usedOffline });
  } catch {
    const response = processOfflineQuery(query, output, 'en');
    res.json({ response, offline: true });
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
  const output = getCurrentEngineOutput();

  try {
    const result = await processWithGemini(query, output);
    res.json({ response: result.response, offline: result.usedOffline, language });
  } catch {
    const response = processOfflineQuery(query, output, language);
    res.json({ response, offline: true, language });
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

  const apiKey = process.env['GOOGLE_CLOUD_API_KEY'] ?? process.env['GCP_API_KEY'];
  if (!apiKey) {
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
  } catch (err) {
    res.status(500).json({ error: 'TTS synthesis failed', detail: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ---------------------------------------------------------------------------
// Simulation tick route (dev / demo)
// ---------------------------------------------------------------------------
app.get('/api/simulation/tick', dataLimiter, (_req, res) => {
  const state = tickSimulation();
  const output = computeTaskQueue({ venue: sofiVenue, state });
  res.json({ tick: state.tick, tasks: output.tasks.length, zones: output.zoneStatuses.length });
});

// ---------------------------------------------------------------------------
// 404 + error handlers
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
