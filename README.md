# SoFi Stadium Copilot — FIFA World Cup 2026
### PromptWars Challenge 4 — Smart Venue Management

> AI-powered stadium operations assistant for SoFi Stadium, Inglewood CA.
> Volunteer copilot + fan assistant, built with Google Gemini function calling.

---

## Live Demo

| View | URL |
|------|-----|
| Volunteer Dashboard | `https://<cloud-run-url>/volunteer` |
| Fan Portal | `https://<cloud-run-url>/fan` |

---

## Architecture

```
client/ (React + Vite)          server/ (Express + TypeScript)
────────────────────────         ──────────────────────────────────
App.tsx (router)                 server.ts (entry)
├── VolunteerDashboard           app.ts (11 routes, Helmet, CORS, Zod)
│   ├── ZoneGrid (live poll)     ├── rules/
│   ├── TaskList (live poll)     │   ├── zone-status.ts
│   └── VolunteerChat (AI)       │   ├── reroute.ts
└── FanPortal                    │   ├── escort-match.ts
    └── FanAssistant             │   ├── gate-rebalance.ts
        (TTS + multilingual)     │   ├── incident.ts
                                 │   ├── priority-rank.ts
                                 │   └── conflict-detect.ts
                                 ├── agent/
                                 │   ├── gemini.ts (5 tools, agentic)
                                 │   └── offline.ts (keyword fallback)
                                 ├── simulation/tick.ts
                                 ├── firestore/client.ts
                                 └── cache/ttl.ts
```

---

## Getting Started

### Prerequisites
- Node.js 22+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### 1. Install dependencies
```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

### 3. Run (two terminals)

**Terminal 1 — Server:**
```bash
cd server
npm run dev         # tsx watch src/server.ts — restarts on change
```

**Terminal 2 — Client:**
```bash
cd client
npm run dev         # Vite dev server with API proxy
```

Open http://localhost:5173

---

## Offline Mode

The app works fully without any API key:
- Rules engine is 100% pure TypeScript, no network calls
- Gemini agent falls back to keyword-intent routing (`agent/offline.ts`)
- Firestore falls back to in-memory Map store
- TTS is gracefully disabled

---

## Running Tests

```bash
cd server
npm test             # vitest run — 152 tests, 9 test files
npm run test:watch   # watch mode
```

### Test Coverage
| File | Tests | Purpose |
|------|-------|---------|
| zone-status.test.ts | 17 | Occupancy classification |
| reroute.test.ts | 14 | Crowd reroute priority |
| escort-match.test.ts | 27 | Escort formula + ADR-7 invariants |
| gate-rebalance.test.ts | 19 | Gate delay priority |
| incident.test.ts | 19 | Incident severity mapping |
| priority-rank.test.ts | 23 | All 8 §3.8 cross-type invariants |
| conflict-detect.test.ts | 15 | 3 conflict types |
| rules-engine.test.ts | 12 | Integration: full pipeline |
| offline-path.test.ts | 6 | No-credentials determinism |

---

## Priority System

Lower number = higher urgency.

| Band | Range | Type |
|------|-------|------|
| A | 0–7 | Reroute (≥93% crush zone) |
| A | 8–9 | Max-urgency escort / Reroute 91–92% |
| A | 10 | High-severity incident |
| A+B | 8–20 | Escort (floor 8, base 20) |
| B | 21–40 | Gate rebalance (floor 21, base 40) |
| B | 30 | Medium incident |
| C | 60 | Low incident |

See [decisions.md](./decisions.md) for full ADR documentation.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/api/zones` | All zone statuses |
| GET | `/api/zones/:id` | Single zone |
| GET | `/api/tasks` | Ranked task queue |
| GET | `/api/tasks/:id` | Single task |
| POST | `/api/escort` | Create escort request |
| GET | `/api/escort` | Pending escorts |
| POST | `/api/ask` | Volunteer AI copilot |
| POST | `/api/fan/assist` | Fan assistant (multilingual) |
| POST | `/api/tts` | Cloud TTS → base64 MP3 |
| GET | `/api/simulation/tick` | Advance simulation |

---

## GCP Deployment

```bash
# Build + deploy to Cloud Run
./deploy/deploy.sh YOUR_PROJECT_ID us-central1
```

See [deploy/service.yaml](./deploy/service.yaml) for Cloud Run configuration.

---

## Google Services Integration

| Service | Usage |
|---------|-------|
| **Gemini 2.0 Flash** | Volunteer copilot + fan assistant (5 function tools) |
| **Cloud Firestore** | Task/escort/incident persistence (in-memory fallback) |
| **Cloud Text-to-Speech** | Audio responses in fan portal (8 languages) |
| **Cloud Run** | Containerised Express server deployment |

---

## Accessibility

- WCAG AA contrast on both volunteer (dark blue) and fan (dark violet) themes
- ARIA roles, labels, and live regions throughout
- Large-text fan view (base size increases on `.view-fan`)
- Keyboard navigation with visible focus indicators
- Screen-reader-compatible chat interface

---

## Security

- Helmet.js with strict CSP headers
- Rate limiting: 30 req/min for AI routes, 300 req/min for data routes
- Zod validation on all POST body inputs
- Input sanitization (HTML tag stripping)
- Prompt injection containment in Gemini system prompt
- Body size capped at 16KB
