# SoFi Stadium Copilot

PromptWars Challenge 4 - Smart Venue Management

AI-powered stadium operations assistant for SoFi Stadium during FIFA World Cup 2026. The app combines a volunteer operations dashboard, fan accessibility portal, deterministic rules engine, Gemini function-calling copilot, Cloud Firestore persistence, Cloud Text-to-Speech, and Cloud Run deployment.

## Live Demo

| View | URL |
|------|-----|
| Volunteer Dashboard | https://promptwars-smart-stadium-241555494310.asia-south1.run.app/volunteer |
| Fan Portal | https://promptwars-smart-stadium-241555494310.asia-south1.run.app/fan |
| Health Check | https://promptwars-smart-stadium-241555494310.asia-south1.run.app/api/healthz |

## Judge-Visible Demo Loop

The deployed demo starts with seeded operational pressure so evaluators see a non-empty queue immediately: crowd pressure, a gate delay, a medical incident, and an accessibility escort.

Fan escort requests are persisted and become volunteer tasks. Volunteers can assign, start, and resolve tasks from the dashboard. Those lifecycle updates are persisted in Firestore when GCP credentials are present, with an in-memory fallback for zero-credential local runs.

Gemini responses keep the simple UI contract (`response`, `offline`) and also expose judge-friendly evidence fields: `factsUsed`, `taskIds`, and `recommendedActions`.

## Architecture

```text
client/ (React + Vite)             server/ (Express + TypeScript)
App.tsx                            server.ts
pages/VolunteerDashboard.tsx       app.ts (routes, Helmet, CORS, Zod)
pages/FanPortal.tsx                rules/ (deterministic task engine)
components/TaskList.tsx            agent/gemini.ts (5 function tools)
components/FanAssistant.tsx        agent/offline.ts
hooks/useData.ts                   state/operations.ts
api/client.ts                      firestore/client.ts
                                    simulation/tick.ts
                                    cache/ttl.ts
```

## Getting Started

Prerequisites:

- Node.js 22+
- Optional Gemini API key from Google AI Studio

Install dependencies from the repo root:

```bash
npm install
```

Run dev mode:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Offline Mode

The app works without credentials:

- Rules engine is pure TypeScript.
- Gemini falls back to deterministic keyword routing.
- Firestore falls back to an in-memory store.
- TTS fails gracefully when Google Cloud identity is absent.

## Verification

Latest verified local run:

```text
TypeScript: pass
Lint: pass with 11 existing non-null assertion warnings
Server tests: 209 passing
Client tests: 19 passing
Total tests: 228 passing
Production build: pass
```

Commands:

```bash
npm run typecheck
npm run lint
npm run test:all
npm run build
```

## Test Coverage Summary

| Area | Tests | Purpose |
|------|-------|---------|
| zone-status.test.ts | 17 | Occupancy classification |
| reroute.test.ts | 14 | Crowd reroute priority |
| escort-match.test.ts | 27 | Escort formula and priority invariants |
| gate-rebalance.test.ts | 19 | Gate delay priority |
| incident.test.ts | 19 | Incident severity mapping |
| priority-rank.test.ts | 23 | Cross-type priority invariants |
| conflict-detect.test.ts | 15 | Conflict detection |
| rules-engine.test.ts | 12 | Full deterministic pipeline |
| offline-path.test.ts | 6 | No-credential fallback behavior |
| app.test.ts | 30 | API routes, escort-to-task flow, lifecycle, AI evidence |
| client component tests | 19 | ZoneGrid and TaskList lifecycle actions |

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Deployment-friendly health check |
| GET | `/healthz` | Health check |
| GET | `/api/zones` | All zone statuses |
| GET | `/api/zones/:id` | Single zone |
| GET | `/api/tasks` | Ranked task queue |
| GET | `/api/tasks/:id` | Single task |
| PATCH | `/api/tasks/:id` | Assign/start/resolve task |
| POST | `/api/escort` | Create escort request |
| GET | `/api/escort` | Pending escorts |
| POST | `/api/ask` | Volunteer AI copilot |
| POST | `/api/fan/assist` | Fan assistant |
| POST | `/api/tts` | Cloud TTS to base64 MP3 |
| GET | `/api/simulation/tick` | Advance simulation |

## GCP Deployment

PowerShell on Windows:

```powershell
.\deploy\deploy.ps1 -ProjectId promptwars-4-502819 -Region asia-south1
```

Bash:

```bash
./deploy/deploy.sh promptwars-4-502819 asia-south1
```

The deployment builds with Cloud Build, deploys `promptwars-smart-stadium`, injects `GEMINI_API_KEY` from Secret Manager, and runs as `241555494310-compute@developer.gserviceaccount.com`.

## Google Services Integration

| Service | Usage |
|---------|-------|
| Gemini 2.0 Flash | Volunteer copilot and fan assistant with function tools |
| Cloud Firestore | Escort requests, task lifecycle state, task snapshots |
| Cloud Text-to-Speech | Audio responses in the fan portal |
| Cloud Run | Containerized single-service deployment |
| Secret Manager | Gemini API key injection |
| Cloud Build | Container build and push |

## Accessibility

- WCAG AA-oriented contrast across volunteer and fan views.
- ARIA roles, labels, and live regions.
- Large-text fan view.
- Keyboard navigation with visible focus indicators.
- Screen-reader-compatible chat interface.
- Cloud Text-to-Speech endpoint for fan assistant audio output.

## Security

- Helmet.js security headers.
- CSP keeps scripts restricted; inline styles are currently allowed because the React UI uses `style={{ ... }}` attributes.
- Rate limiting: 30 requests/minute for AI routes, 300 requests/minute for data routes.
- Zod validation on request bodies.
- Input sanitization for submitted strings.
- Prompt-injection containment in Gemini system prompt.
- Body size capped at 16 KB.
