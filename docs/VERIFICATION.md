# Verification

This file gives judges a quick way to confirm that the repo builds, tests, and runs the same behavior shown in the live demo.

## Live Deployment

| Check | URL |
|-------|-----|
| Volunteer dashboard | https://promptwars-smart-stadium-241555494310.asia-south1.run.app/volunteer |
| Fan portal | https://promptwars-smart-stadium-241555494310.asia-south1.run.app/fan |
| Health | https://promptwars-smart-stadium-241555494310.asia-south1.run.app/api/healthz |
| Task queue | https://promptwars-smart-stadium-241555494310.asia-south1.run.app/api/tasks |

Latest live smoke result:

```text
/api/healthz: status ok, Gemini online, Firestore connected
/api/tasks: non-empty queue with reroute, escort, gate rebalance, and medical tasks
```

## Local Commands

Run from the repo root:

```bash
npm install
npm run typecheck
npm run lint
npm run test:all
npm run build
```

Latest local result:

```text
TypeScript: pass
Lint: pass with 11 existing non-null assertion warnings
Server tests: 209 passing
Client tests: 19 passing
Total tests: 228 passing
Production build: pass
```

## Behavior Covered By Tests

| Area | Coverage |
|------|----------|
| Rules engine | occupancy classification, reroute, escort, gate rebalance, incident priority, ranking, conflicts |
| Offline mode | zero-credential deterministic responses |
| API integration | health, zones, tasks, task lifecycle, escort request, AI routes, TTS graceful fallback |
| Fan-to-volunteer loop | created escort request appears in task queue |
| Client UI | ZoneGrid rendering and TaskList lifecycle actions |

## Manual Judge Script

1. Open the Volunteer Dashboard.
2. Confirm the task queue is not empty.
3. Open the Fan Portal.
4. Select an accessibility need and request an escort.
5. Return to the Volunteer Dashboard.
6. Confirm an escort task appears.
7. Click Start or Resolve on a task.
8. Confirm the status changes.
9. Ask the copilot: `What are the top tasks and why?`
10. Confirm the API response includes grounded evidence fields when inspected.

## Deployment Verification

Deploy from Windows PowerShell:

```powershell
.\deploy\deploy.ps1 -ProjectId promptwars-4-502819 -Region asia-south1
```

Smoke test:

```powershell
curl.exe -L https://promptwars-smart-stadium-241555494310.asia-south1.run.app/api/healthz
curl.exe -L https://promptwars-smart-stadium-241555494310.asia-south1.run.app/api/tasks
```
