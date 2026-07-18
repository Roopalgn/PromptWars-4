# Architecture Guide — SoFi Stadium Copilot

## System Overview

```
Browser
  ├── /volunteer → VolunteerDashboard (React)
  └── /fan       → FanPortal (React)
         ↓ HTTP (Vite proxy in dev / Firebase Hosting rewrite in prod)
Express Server (Cloud Run)
  ├── Security layer: Helmet CSP + CORS + rate limiting + Zod + sanitizer
  ├── Rules Engine (pure TypeScript — zero I/O)
  │     zone-status → reroute → escort-match → gate-rebalance
  │     → incident → priority-rank → conflict-detect
  │     → computeTaskQueue (composition root)
  ├── Simulation: bounded random walk, seeded PRNG
  ├── AI Agent: Gemini 2.0 Flash with 5 function-calling tools
  │     ↳ Falls back to offline.ts (keyword engine) on any error
  ├── Firestore client: in-memory fallback when GCP_PROJECT_ID absent
  └── Cloud TTS: graceful 503 when Google Cloud credentials absent
```

## Data Flow

```
1. Simulation tick (every 5s in dev, or GET /api/simulation/tick)
       ↓
2. ZoneOccupancySignal[] + WeatherSignal → computeTaskQueue()
       ↓
3. RulesEngineOutput { tasks[], zoneStatuses[], conflicts[] }
       ↓
4. Stored in process-local state (SimulationState)
       ↓
5. GET /api/tasks → client polls every 3s
   GET /api/zones → client polls every 5s
```

## Priority Number Line

Priority 1 = most urgent. All formulas produce lower numbers for higher urgency.

```
0 ──── 8 ──── 10 ──── 20 ──── 21 ──── 30 ──── 60
│      │       │        │       │       │       │
│  CRUSH  MAX   HIGH    MAX    GATE   MED     LOW
│ REROUTE ESC  INC     ESC    FLOOR   INC     INC
│ (≥93%) (8)  (10)    (8)    (21)   (30)    (60)
```

**Bands** (ADR-7):
- Band A (0–20): Life-safety — reroute crush risk, max escorts, high incidents
- Band B (21–40): Operations — gate rebalance, medium incidents
- Band C (41–100): Low priority — routine facilities, low incidents

## Module Dependencies

```
types/index.ts              ← no deps (pure type definitions)
data/sofi-venue.ts          ← types
rules/zone-status.ts        ← types
rules/reroute.ts            ← types, data/sofi-venue
rules/escort-match.ts       ← types, data/sofi-venue
rules/gate-rebalance.ts     ← types, data/sofi-venue
rules/incident.ts           ← types, data/sofi-venue
rules/priority-rank.ts      ← types
rules/conflict-detect.ts    ← types
rules/index.ts              ← all rules (composition root)
simulation/tick.ts          ← types, data/sofi-venue, rules/index
agent/offline.ts            ← types (no external deps)
agent/gemini.ts             ← @google/genai, types, rules/index
firestore/client.ts         ← @google-cloud/firestore, types
cache/ttl.ts                ← no deps
app.ts                      ← all above
server.ts                   ← app.ts
```

## Key Design Constraints

| Constraint | Value | Source |
|------------|-------|--------|
| Gate rebalance floor | 21 | ADR-4 — never beats life-safety |
| Escort floor | 8 | ADR-3 — max escort beats high incident |
| Reroute floor | 0 (no floor) | ADR-7 — crush risk outranks all |
| Escort stacking | Both >10 AND >20 fire for 25-min wait | ADR-3 |
| Reroute wins escort at | ≥93% adjusted occupancy | ADR-7 |
| Reroute wins incident at | ≥92% adjusted occupancy | ADR-7 |
| TTS body size cap | 500 chars | app.ts Zod schema |
| Rate limit: AI routes | 30/min | app.ts |
| Rate limit: data routes | 300/min | app.ts |

## Offline Mode Architecture

When `GEMINI_API_KEY` is absent or Gemini returns an error:

```
POST /api/ask
  → processWithGemini() throws or rejects
  → catch: processOfflineQuery(query, output, 'en')
  → response: { offline: true, ... }

POST /api/fan/assist (language='es')
  → processWithGemini() throws or rejects
  → catch: processOfflineQuery(query, output, 'es')
  → prepends: "⚠️ Modo sin conexión — respondiendo en inglés."
  → response: { offline: true, language: 'es', ... }
```

Firestore: `client.ts` auto-detects `GCP_PROJECT_ID`. If absent, uses `Map<string, unknown>` in-memory store. All CRUD operations work identically.

## Test Architecture

```
server/test/
  rules/          ← 8 files, 146 tests — pure function unit tests
  integration/    ← app.test.ts, ~35 tests — supertest, exercises offline path
  offline/        ← offline-path.test.ts, 6 tests — rules engine without Gemini

client/src/test/
  ZoneGrid.test.tsx   ← 8 tests
  TaskList.test.tsx   ← 10 tests
```

All tests pass with **zero credentials** — no `GEMINI_API_KEY`, no `GCP_PROJECT_ID`.
