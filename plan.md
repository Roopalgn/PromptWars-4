# Project Brief: Smart Stadiums & Tournament Operations
### PromptWars Virtual — Challenge 4 (FIFA World Cup 2026)

This document is the single source of truth for this build. Read it fully
before writing an implementation plan or any code. It contains: the
competition rules, the problem statement, research findings on what the
current top-scoring entries actually do (and why), the chosen product
direction, and explicit instructions for producing the implementation plan.

---

## 1. Competition Rules

**Format:** PromptWars Virtual, bi-weekly hackathon. This entry is for
**Challenge 4**. No hard deadline is being tracked for this build — build for
quality, not speed.

**Platform:** Use whichever AI coding platform is being used to execute this
brief. (Earlier weeks of this series mandated Google Antigravity; Challenge 4
generalizes this to "the AI platform you are going to use" — no specific
platform is mandatory this round.)

**Prerequisites**
- Git installed and configured
- Active GitHub account, able to create/manage public repos
- The AI coding platform downloaded and set up

**Hard constraints — failure to follow may void evaluation**
- Maximum **3 submission attempts**
- Repository size **under 10 MB** (gitignore `node_modules`, `dist`, `build`,
  venvs, coverage reports — do not let build artifacts into git history)
- Repository must be **public**
- Repository must contain **only one branch**

**Workflow**
1. Create a new public GitHub repo.
2. Clone it into the AI coding platform.
3. Build through prompting + coding.
4. Commit and push regularly.
5. Keep everything on a single branch.

**Required submission contents**
- Public GitHub repo link
- Complete project code in the repo
- A `README.md` explaining: chosen vertical, approach and logic, how the
  solution works, and any assumptions made
- A short technical blog post (Build-in-Public narrative)
- A LinkedIn post: photo of the setup/build, brief idea description,
  hashtags `#BuildwithAI #PromptWarsVirtual`, tags `@googlefordevelopers
  @hack2skill`

**Challenge expectations (this is the actual rubric behind the scenes)**
- Ability to build a **smart, dynamic assistant**
- **Logical decision making based on user context** — not just a chatbot
  that answers questions, but a system that reasons over state and produces
  different outputs for different contexts
- Practical, real-world usability
- Clean, maintainable code
- Must choose **one** challenge vertical/persona and design the solution
  around that persona and logic

**AI Code Analysis — the six graded criteria**
1. **Code Quality** — clean, readable, well-structured
2. **Security** — safe practices, no common vulnerabilities
3. **Efficiency** — resource usage (time, memory, cost)
4. **Testing** — how easily the code can be tested, validated, and maintained
5. **Accessibility** — usable for diverse users and environments
6. **Google Services** — how effectively Google services are integrated

AI analysis takes ~4-5 minutes and evaluates the repo directly. Assume the
evaluator is an AI system reading and possibly running the code, not a human
skimming a demo video — see §3 for what this implies.

**Impact tiers.** The rules mention High/Medium/Low impact tiers that
heavily/moderately/lightly move the score, but the tier-to-criterion mapping
for Challenge 4 specifically was **not included** in the source material this
brief was built from. Do not assume which of the six criteria is "High
impact" — build all six to a genuinely strong standard rather than
optimizing for a guessed subset. If the actual submission portal or linked
doc states the tier mapping, treat that as an override to this brief.

---

## 2. The Problem Statement (verbatim)

> **[Challenge 4] Smart Stadiums & Tournament Operations**
>
> Build a GenAI-enabled solution that enhances stadium operations and the
> overall tournament experience for fans, organizers, volunteers, or venue
> staff. The solution must leverage Generative AI to improve navigation,
> crowd management, accessibility, transportation, sustainability,
> multilingual assistance, operational intelligence, or real-time decision
> support during the FIFA World Cup 2026.

Four personas are offered (fans, organizers, volunteers, venue staff), and
eight verticals (navigation, crowd management, accessibility, transportation,
sustainability, multilingual assistance, operational intelligence, real-time
decision support). The rules require picking **one** vertical to center the
solution's persona and logic around — but nothing prevents a solution that
serves one primary persona while touching multiple verticals through a
unified system, which is the intended structure of this build (see §4).

---

## 3. Competitive Research Findings

Five repos claiming top leaderboard positions for this exact challenge were
cloned and read in full (source, tests, CI, docs) to reverse-engineer what
actually scores well. Findings below should directly shape implementation
decisions.

### 3.1 They are not five independent solutions — they are three

- `Auenchanters/Virtual-Prompt-war-Week-4` and
  `code-with-kishan/Smart-Stadiums-Tournament-Operations` are **byte-identical**
  in every source file (`client/`, `server/`, `package.json` — zero diff).
  Only `README.md`, `LICENSE`, and `CODE_OF_CONDUCT.md` differ cosmetically
  (badge styling, wording). Both are single-commit repos and both reference
  the same live Cloud Run URL. This is the same codebase ("StadiumIQ")
  submitted under two accounts.
- `paladuguganeshnaidu/promptwars4` ("ArenaIQ") is a fork of that same
  StadiumIQ codebase with real additions (theme toggle, an SOS emergency
  button, a self-audit `VERIFICATION.md`) — but it left stale assumptions in
  place (docs claim a Render deployment while the server code still assumes
  Firestore/GCP-only infra).
- `Jagadeesh9hub/smart-stadium` ("StadiumMate") and
  `DeadlyRockz/Smart-Stadiums-Tournament-Operations` ("AccessMate") are
  genuinely independent, differently-architected Python/FastAPI builds.

**Implication:** the effective bar at "top of leaderboard" is one strong
React/Node entry (StadiumIQ) and two strong Python entries (StadiumMate,
AccessMate) — not five. Beating all three on their strengths, while adding
what none of them have, is achievable.

### 3.2 What StadiumIQ (the React/Node entry) does well

- **Architecture:** npm workspaces monorepo, `server/` (Node 22, Express 5,
  TypeScript) + `client/` (React 19, Vite, TypeScript), strict feature-folder
  convention (`features/assistant/`, `features/operations/`, `features/stadium/`),
  dependencies point inward only (route → service → lib/external client).
- **Two personas in one system:** fan-facing grounded Q&A assistant (Gemini,
  5 languages) + an organizer-facing "operations briefing" that turns a live
  Firestore snapshot into a four-section prose briefing via one Gemini call.
  This briefing is genuinely the weakest part of the whole entry — it's
  summarization, not decision logic (see §4 for how to do this better).
- **Simulated live signal:** a server-side bounded random walk nudges zone
  occupancy in Firestore on an interval, so the ops board reads as "live."
  Documented explicitly as an ADR: same read shape as a real sensor feed
  would produce, so swapping in a real feed later touches one function.
- **Security:** Gemini key only in Secret Manager (never repo/image),
  gitleaks scan on every push, zod validation on every input (500-char cap
  on the assistant question, unknown keys rejected), full Helmet CSP with
  **no `unsafe-inline`/`unsafe-eval`** anywhere, explicit CORS allowlist,
  layered rate limiting (general + a stricter limit on the two Gemini
  endpoints), prompt-injection containment (system-framed prompt instructing
  the model to ignore embedded instructions in user text) + output
  sanitization (`sanitizeModelText()` strips HTML/control chars, caps length)
  before anything reaches the client, sanitized `{code, message}` error
  responses only.
- **Efficiency:** per-instance TTL cache on repeated assistant questions and
  briefings, `--min-instances=1` to avoid cold starts, `--max-instances=3` to
  cap Gemini spend under scale-out, route-level code splitting, compression,
  immutable caching on hashed assets.
- **Testing:** ~134 tests total (101 server + 33 client). Vitest unit tests
  for every service/util covering happy/edge/error paths, zod schema
  boundary tests, supertest integration tests including validation-rejection
  and sanitized-502 paths, Firestore faked in-memory, Gemini mocked, a
  Playwright E2E smoke test with the API mocked at the network boundary,
  95% coverage threshold enforced in CI (fails the build on regression),
  Stryker mutation testing to check suite strength (not just coverage %).
- **Accessibility:** genuinely automated, not eyeballed —
  `@axe-core/playwright` and `eslint-plugin-jsx-a11y` in CI,
  `role="meter"` + `aria-valuenow`/`aria-valuemin`/`aria-valuemax` on the
  live density bars, color-plus-text status (never color-only), and a
  **documented, reproducible** Lighthouse run
  (`docs/lighthouse-results.md`) showing Accessibility = 100 on every route
  with the exact `npx lighthouse` command to reproduce it.
- **Google Services footprint:** Gemini API (`@google/genai` SDK) +
  Firestore + Cloud Run + Secret Manager + Cloud Logging. The actual
  `gcloud run deploy` command is in the docs, so the claim is trivially
  checkable, not just asserted.
- **Documentation an AI reader can trust on sight:** `docs/ARCHITECTURE.md`
  (layout, layering, request lifecycle, mermaid data-flow diagram, testing
  strategy, deployment), `docs/decisions.md` — five ADRs in strict
  context → decision → tradeoff format for every non-obvious choice (why one
  Cloud Run service, why simulated telemetry, why Secret Manager over
  env-in-repo, why in-memory cache over Redis, why prompt-based i18n over a
  UI framework), and `SECURITY.md` stating the threat model explicitly.

### 3.3 What StadiumMate (Jagadeesh9hub, independent) does well

- **"Rules before LLM" architecture:** a deterministic `context_engine.py`
  resolves every fact (target facility, route via BFS/Dijkstra over a zone
  graph, simulated crowd level, accessibility mode, urgency/crowd-avoidance
  swaps) from structured context alone — **no LLM involved in any decision**.
  The LLM's only job is phrasing/translating already-resolved facts into
  natural language in the requested language, and it's explicitly forbidden
  (via a strict delimited system prompt) from inventing facilities or
  following instructions embedded in user text.
- **Zero-credential operation:** if `GEMINI_API_KEY` is unset, the app
  transparently falls back to a deterministic `MockLLM` — it never crashes,
  and an evaluator with no key can still fully exercise it.
- **Short-circuit for efficiency:** if the fan asks no free-text question,
  the answer comes from offline EN/ES/FR templates — **no LLM call at all**.
- **Accessibility rules are load-bearing, not decorative:** wheelchair/visual
  need → only accessible facilities + step-free routes; visual need →
  landmark-based audio-friendly directions + screen-reader mode; hearing
  need → visual signage emphasis + captioned mode; full response
  localization including facility/zone names, not just UI chrome.
- **Lightweight stack:** FastAPI + vanilla JS static frontend (no React
  build step), 75 tests, still ships full security headers, strict CORS
  allowlist, a token-bucket rate limiter, and privacy-preserving logging
  (logs intents/zones/outcome, never the raw question text).
- **Documents actual `gcloud run deploy` commands** for Google Services
  credibility.

### 3.4 What AccessMate (DeadlyRockz, independent) does well

- **Explicitly reverse-engineers the rubric in its own README:** states
  outright that it chose Accessibility as the primary vertical *because*
  "Accessibility – inclusive and usable design" is a named scoring
  criterion, and folds in multilingual assistance + real-time decision
  support as supporting capabilities under that same persona.
- **Real function-calling agent, not a single prompt call:** Gemini
  `gemini-2.5-flash` drives a manual function-calling loop (iteration cap 8)
  over four tools (`get_venue_info`, `find_accessible_services`,
  `get_live_status`, `plan_visit`). Context genuinely changes the answer — a
  sensory need routes to sensory rooms and the quiet entrance; a mobility
  need routes to step-free gates/elevators/accessible seating; a live-feed
  elevator outage down-ranks a gate in real time.
  `plan_visit` composes a full step-by-step arrival plan (which gate, when
  to arrive — longer lead time for higher congestion and for declared
  needs, services en route, need-specific tips, outage warnings) — this is
  the closest any of the five gets to genuine multi-signal decision fusion.
- **Graceful degradation, always answers:** missing key, `401/403/429`,
  `5xx`, or a connection error all fall back to a deterministic
  keyword/intent offline engine (`app/offline.py`) that normalizes input
  (lowercase, accent-strip, and for Arabic also folds hamza forms and
  diacritics) and answers from the same four tools — so live and offline
  answers stay consistent, and an evaluator can run the entire app with
  **zero credentials and no network**.
- 134 tests, no CORS middleware needed (same-origin UI+API), key never
  logged or returned, `/healthz` reports only live/offline mode.
- **Weakest on Google Services** of the three — only calls the Gemini
  Developer API via an AI Studio key, no Cloud Run/Firestore/other GCP
  service documented.

### 3.5 The cross-cutting pattern behind all of it

Every one of these entries writes **for an AI reader**, not just for a human
watching a demo: ADRs, an explicit "Approach & Logic" section reasoning about
*why* this design, mermaid diagrams, a reproducible metrics doc with the
exact command to regenerate it, and — the single highest-leverage move
observed — **a working, deterministic, zero-credential offline mode**. If
the thing scoring the repo is itself an AI system that may not have (or may
rate-limit) a live API key, "the app fully answers with no key at all" is
probably worth more than any one feature.

---

## 4. Chosen Direction for This Build

### 4.1 Why this direction

The one clear gap across all three leading entries: **the "operations"
persona is shallow everywhere it exists.** StadiumIQ's ops briefing is a
single Gemini call over a live snapshot producing a paragraph of prose —
summarization dressed as intelligence, not "logical decision making based on
user context" (the exact phrase the rubric uses). Neither Python entry
touches the operations/organizer persona at all. Building for the
**volunteer / gate-marshal persona** properly, with genuine multi-signal
decision logic, is the least-contested and most rubric-aligned lane
available.

### 4.2 Product concept: Operations Command Copilot

**Primary persona:** stadium volunteer / gate marshal.
**Secondary persona:** fan (accessibility + multilingual assistance) —
reuses the same grounded venue dataset and agent core, one Cloud Run
service, one URL (StadiumIQ's ADR-1 reasoning for this is sound — a single
service avoids a CORS hop and a second cold-start budget; reuse the
reasoning, not the code).

**Core loop:** ingest simulated live signals → a deterministic rules engine
fuses them into a priority-ranked, explainable task queue → a Gemini
function-calling agent explains *why* each task exists in plain language and
answers free-text volunteer questions the rule set doesn't cover → the
system always answers, even with zero credentials, via a deterministic
offline fallback.

**Simulated live signals (server-side, same "same read shape as a real feed"
principle as StadiumIQ's ADR-2):**
- Zone occupancy per gate/section (bounded random walk)
- Transit/gate entry delays
- A weather flag (e.g. rain → concourse congestion multiplier)
- An accessibility-escort request queue (fan requests a wheelchair escort,
  sensory-quiet route, etc.)
- Incident reports (medical, security, facilities)

**Rules engine responsibilities (no LLM in the decision path — follow
StadiumMate's "rules before LLM" principle, extended to multi-signal
fusion):**
- Threshold-based zone status (comfortable/busy/critical)
- Escort-request-to-nearest-available-volunteer matching
- **Conflict detection** — e.g., a suggested reroute colliding with an
  active escort request, or two tasks competing for the same volunteer
- Priority ranking across all open tasks

**Gemini agent responsibilities (StadiumMate + AccessMate pattern):**
- Explain, in plain language, *why* a given task is ranked where it is
  (grounded strictly in the resolved facts from the rules engine — never
  invent a fact)
- Answer free-text volunteer questions the rule set doesn't cover
- Multilingual fan-facing answers (reuse the shared grounded dataset)
- **Must degrade to a deterministic offline engine** with zero API key and
  no network — this is non-negotiable given §3.5

**Output shape:** a structured, priority-ranked task queue (JSON → UI
cards: priority, type, location, one-line reasoning, status) — **not**
prose. This is the concrete, checkable evidence of "logical decision making
based on user context" that a paragraph-briefing cannot provide.

### 4.3 What this adds that none of the five current entries have

- Multi-signal fusion with explicit conflict detection (all five entries
  handle one or two signals at most; none detects conflicts between tasks)
- A volunteer-facing structured task queue instead of prose (more checkable,
  more "operational intelligence" than any existing entry)
- Cloud Text-to-Speech for accessibility (audio answers for low-vision/
  low-literacy fans) — a genuinely new Google service none of the five touch
- A test that specifically proves the zero-credential offline path in CI
  (StadiumMate and AccessMate have the *feature*; none of the five appear to
  have an automated test asserting it — verify this claim before repeating
  it to a judge, but it's a cheap, high-value addition either way)

### 4.4 Venue

Pick a World Cup 2026 venue none of the five researched entries used (they
used Estadio Azteca and MetLife Stadium) — e.g. SoFi Stadium (Inglewood) or
Mercedes-Benz Stadium (Atlanta) — so the venue dataset isn't a direct rehash
and the write-up reads as independently researched.

---

## 5. Technical Requirements Mapped to Each Graded Criterion

Use this section as the acceptance checklist for the implementation plan —
every item below should map to a concrete deliverable, not an aspiration.

**Code Quality**
- Feature-folder architecture, dependencies point inward only
- Strict lint + typecheck at zero warnings, enforced in CI
- Docstrings/JSDoc on every exported function
- `docs/ARCHITECTURE.md` (layout, layering, request lifecycle, mermaid
  diagram) + `docs/decisions.md` (ADRs: context → decision → tradeoff for
  every non-obvious choice — venue simulation, offline fallback, caching
  strategy, single-service deploy, etc.)

**Security**
- Secrets only in Secret Manager / gitignored `.env`, never in repo or image
- Automated secret scan (gitleaks) on every push
- Strict schema validation (zod/Pydantic) on every input, length-capped,
  unknown keys rejected
- Full security header set: CSP with **no `unsafe-inline`/`unsafe-eval`**,
  HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` denying unused features, explicit CORS allowlist
- Rate limiting, tightened specifically on LLM-backed endpoints
- Prompt-injection containment (system-framed prompt instructing the model
  to ignore embedded instructions) + output sanitization before anything
  reaches the client
- Sanitized error responses only (`{code, message}`), stack traces
  server-side-logged only
- `SECURITY.md` stating the threat model explicitly, not left implicit

**Efficiency**
- Deterministic short-circuits wherever the rules engine alone can answer
  (cheap and provably fast — no LLM call needed)
- TTL cache for repeated LLM calls
- `--min-instances=1` on Cloud Run to avoid cold starts; cap
  `--max-instances` to bound LLM spend under scale-out
- Code splitting / compression / immutable caching on the frontend

**Testing**
- Target 75-150 tests: pure unit tests for every rule/decision function (no
  I/O — trivial to hit near-100% coverage), schema boundary tests,
  integration tests covering validation-rejection and simulated-
  upstream-failure paths, a small Playwright + axe E2E smoke test
- A test that specifically exercises the zero-credential offline path
- Coverage threshold enforced in CI, failing the build on regression
- Hermetic test runs: fake Firestore in-memory, mock the LLM client —
  nothing depends on live network or a real key

**Accessibility**
- `@axe-core/playwright` (or equivalent) + an a11y lint plugin in CI
- `role="meter"` and full `aria-*` attribution on live indicators
- Color-plus-text status everywhere (never color-only)
- Reduced-motion support
- A documented, **reproducible** Lighthouse run
  (`docs/lighthouse-results.md`) with the exact command to regenerate it
- Cloud Text-to-Speech audio answers, high-contrast/screen-reader toggle,
  fully keyboard-operable task queue

**Google Services**
- Gemini (function-calling agent)
- Firestore (live task/escort state)
- Cloud Run (single-service deploy)
- Secret Manager
- Cloud Logging
- Cloud Text-to-Speech (accessibility — none of the five researched entries
  use this)
- Document the actual `gcloud run deploy` command in the README so the
  claim is checkable, not asserted

---

## 6. Instructions: How to Produce the Implementation Plan

Do not start writing application code before producing a written
implementation plan as a first deliverable. The plan should:

1. **Restate the chosen vertical/persona pairing and the core loop from §4**
   in your own words, confirming you're building the volunteer/gate-marshal
   Command Copilot with a fan-facing secondary persona sharing one service.
2. **Define the data model first**, before any framework code: venue/zone
   schema, task schema (priority, type, location, reasoning, status),
   incident schema, escort-request schema. This should be language/framework
   agnostic at this stage.
3. **Design the rules engine in isolation** — list every rule it must
   implement (threshold-based zone status, escort matching, conflict
   detection, priority ranking) as pure functions with defined
   inputs/outputs, testable with zero I/O.
4. **Design the agent layer**: the exact tool/function declarations the
   Gemini agent will expose, the system prompt framing (grounding +
   injection containment, following §3.2/§3.3/§3.4 patterns), and the
   deterministic offline-fallback engine's behavior for the same inputs.
5. **Propose the technology stack** with a one-line justification per
   choice (framework, hosting, database) — an ADR-style justification, not
   just a list.
6. **Break the build into phases with concrete exit criteria per phase**,
   in this order, and do not proceed to the next phase until the previous
   one's exit criteria are met:
   - Phase 1: data model + rules engine + full unit test suite for the
     rules engine (no LLM, no frontend yet)
   - Phase 2: API layer + Gemini agent + offline fallback + security
     middleware + integration tests
   - Phase 3: frontend — volunteer task queue UI + fan assistant UI +
     accessibility work + axe/Lighthouse verification
   - Phase 4: GCP wiring — Firestore, Secret Manager, Cloud Run, Cloud
     Text-to-Speech, deploy
   - Phase 5: documentation (`README.md`, `ARCHITECTURE.md`,
     `decisions.md`, `SECURITY.md`, `lighthouse-results.md`, a
     `VERIFICATION.md` self-audit checklist mapped **honestly** to all six
     stated criteria in §1 — do not substitute or drop a criterion the way
     one researched entry quietly did) + final self-audit against §5 before
     using any of the 3 submission attempts
7. **List explicit assumptions and open questions** rather than silently
   picking defaults for anything ambiguous in this brief (e.g., exact venue
   choice, exact language set beyond English/Spanish/French, exact
   escort-matching algorithm) — surface these for a decision rather than
   guessing.
8. **State repo hygiene up front**: single branch, public, `.gitignore`
   covering `node_modules`/`dist`/`build`/venvs/coverage so the 10 MB cap
   isn't at risk, and a pre-flight command sequence (lint, typecheck, test,
   build, smoke) to run before every one of the 3 submission attempts.

Output the plan as a structured document before writing implementation code.