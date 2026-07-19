# Architecture

SoFi Stadium Copilot is a single Cloud Run application with a React frontend and an Express/TypeScript backend. It is designed for a hackathon judge to evaluate quickly: open the live dashboard, see a non-empty operations queue, submit a fan escort request, and watch it become a volunteer task.

## System Shape

```text
Browser
  /volunteer  -> React volunteer dashboard
  /fan        -> React fan accessibility portal
  /api/*      -> Express API on the same Cloud Run origin

Express API
  app.ts                  HTTP routes, Helmet, CORS, rate limits, Zod validation
  state/operations.ts     demo seeding, Firestore-backed escort/task lifecycle state
  rules/*                 deterministic rules engine
  agent/gemini.ts         Gemini function-calling copilot
  agent/offline.ts        zero-credential deterministic fallback
  firestore/client.ts     Firestore wrapper with in-memory fallback
  simulation/tick.ts      bounded simulation state
```

## Judge Demo Flow

1. `GET /api/tasks` returns a seeded queue immediately: reroutes, a gate rebalance, an escort, and a medical task.
2. A fan submits `POST /api/escort`.
3. `state/operations.ts` persists the escort request.
4. The rules engine converts that request into an escort task.
5. A volunteer uses `PATCH /api/tasks/:id` to assign, start, or resolve the task.
6. The lifecycle state is persisted in Firestore when GCP credentials are present.

## Rules Engine

The rules engine is deterministic and testable without credentials. It combines:

- zone occupancy and weather-adjusted crowd pressure
- gate delays and queue size
- accessibility escort requests
- medical/security/facilities incidents
- conflict detection between tasks
- cross-type priority ranking

Lower priority numbers are more urgent.

| Task type | Signal source | Priority idea |
|-----------|---------------|---------------|
| Crowd reroute | critical zone occupancy | crush risk wins |
| Escort | need type + wait time | vulnerable fans move up |
| Gate rebalance | delay + queue size | operations surge |
| Incident | severity table | life-safety anchor |

## AI Layer

Gemini 2.0 Flash is used as a function-calling copilot. The model is grounded with five tools:

- `get_zone_status`
- `get_task_queue`
- `get_escort_request`
- `explain_task_priority`
- `get_fan_venue_info`

The API keeps a simple UI response shape and also returns judge-visible evidence:

```json
{
  "response": "...",
  "offline": false,
  "factsUsed": ["..."],
  "taskIds": ["..."],
  "recommendedActions": [{ "taskId": "...", "action": "...", "rationale": "..." }]
}
```

If Gemini is unavailable, the offline engine still answers from deterministic task and zone data.

## Google Cloud Services

| Service | Use |
|---------|-----|
| Cloud Run | Hosts the full app and API |
| Cloud Build | Builds the container image |
| Secret Manager | Stores `GEMINI_API_KEY` |
| Firestore | Persists escort requests, task lifecycle state, and task snapshots |
| Cloud Text-to-Speech | Generates fan assistant audio |
| Gemini API | Volunteer/fan copilot responses |

## Deployment

The canonical deployed URL is:

```text
https://promptwars-smart-stadium-241555494310.asia-south1.run.app
```

Deploy from Windows PowerShell:

```powershell
.\deploy\deploy.ps1 -ProjectId promptwars-4-502819 -Region asia-south1
```

## Local Verification

```bash
npm install
npm run typecheck
npm run lint
npm run test:all
npm run build
```
