# Architecture Decision Records (ADRs)
## SoFi Stadium Copilot — FIFA World Cup 2026

---

## ADR-1: Priority Convention — 1 = Highest Urgency

**Status:** Accepted  
**Context:** Need a consistent convention for task priority numbers.  
**Decision:** Lower number = higher urgency. Priority 1 is the most urgent task, processed first.  
**Consequences:** All formula deductions move priority *downward* (toward lower numbers) to increase urgency. Wait-time stacking subtracts from the base value. All invariant checks use `<` to assert "more urgent."

---

## ADR-2: Zone Status Classification — Weather Adjustment

**Status:** Accepted  
**Context:** Indoor concourses under rain become effectively more crowded as fans shelter indoors.  
**Decision:** `adjustedPct = occupancyPct × concourseMultiplier`, capped at 100. Gate and section zones cap the multiplier at 1.5 (not the full concourse multiplier) as they are partially sheltered.  
**Thresholds:** Comfortable < 70%, Busy 70–85%, Critical > 85%.

---

## ADR-3: Escort Priority Formula

**Status:** Accepted  
**Context:** Accessibility needs have different urgency levels. Long waits increase urgency.  
**Decision:**

```
priority = max(8, 20
  − needDeduction(needType)
  − (waitingMinutes > 10 ? 5 : 0)
  − (waitingMinutes > 20 ? 3 : 0)
)
```

**NeedDeduction:**
- wheelchair, visual: −4 (most vulnerable)
- elderly, cognitive: −3
- hearing: 0 (no deduction)

**Wait deductions STACK** (>10min AND >20min both apply simultaneously).

**Floor = 8** prevents escort from ever outranking a high-severity incident (priority 10) except in the crush-risk regime where reroute already dominates.

**Boundary cases:**
- Exactly 10 minutes: >10 does NOT fire (strict >).
- Exactly 20 minutes: >20 does NOT fire; only >10 fires (−5).
- 25 minutes: both fire (−5 − 3 = −8 additional).

---

## ADR-4: Gate Rebalance Priority Formula

**Status:** Accepted  
**Context:** Gate delays grow in severity with delay duration and queue size.  
**Decision:**

```
priority = max(21, 40
  − min(20, 2 × (delayMinutes − 5))
  − (fanQueueCount > 500 ? 5 : 0)
)
```

**Trigger:** Only fires when delayMinutes > 5.  
**Floor = 21:** Prevents a severely delayed gate from ever overriding a high-severity incident (10) or max-urgency escort (8). Gate operations are urgent but not life-safety tasks.

---

## ADR-5: Incident Priority Lookup Table

**Status:** Accepted  
**Context:** Incident severity is categorical, not a calculated formula.  
**Decision:** Fixed values — High: 10, Medium: 30, Low: 60. These anchor the priority number line and are the primary reference points for all other formulas.

---

## ADR-6: Type-Weight Tiebreaking

**Status:** Accepted  
**Context:** When two tasks have identical priority numbers, a tiebreak is needed.  
**Decision:** Sort by `priority ASC → TYPE_WEIGHT ASC → createdAt ASC`.  
**Type weights:** medical-response=1, security-response=2, escort=3, crowd-reroute=4, gate-rebalance=5, facilities=6.  
**Rationale:** In a tie, life-safety tasks (medical, security) should always come before crowd management tasks.

---

## ADR-7: Reroute vs. Other Task Types — Full Cross-Type Ordering

**Status:** Accepted  
**Context:** Reroute priority range is (0, 15). It overlaps with escort (8–20) and incident (10, 30, 60). Six pairings must be explicitly decided.

**Reroute formula:** `priority = 100 − adjustedPct` (NO FLOOR).

**Pairing decisions:**

| Pairing | Threshold | Decision |
|---------|-----------|----------|
| Reroute vs. High Incident | ≥91%: reroute ties; ≥92%: reroute wins | **Crush risk justifies overriding incident.** ADR-7. |
| Reroute vs. Max Escort | ≥93%: reroute wins; =92%: tie → escort wins by type-weight | **Crush risk justifies overriding max-urgency escort at ≥93%.** ADR-7 extension. |
| Reroute vs. Gate | Reroute always ≤14; Gate floor is 21 | **Reroute always outranks gate.** |
| Escort vs. High Incident | Escort floor=8 < Incident high=10 | **Max-urgency escort outranks high incident.** |
| Escort vs. Gate | Escort floor=8 < Gate floor=21 | **Max-urgency escort always outranks gate.** |
| Incident vs. Gate | High incident=10 < Gate floor=21 | **High incident always outranks even most-delayed gate.** |

**Key invariants (unit-tested in §3.8):**
1. Gate(min=21) > Incident(high=10): gate NEVER outranks high incident.
2. Gate(min=21) > Escort(max=8): gate NEVER outranks max-urgency escort.
3. Reroute(≥91%) < Incident(high=10): reroute at 91%+ outranks high incident.
4. Reroute(=92%) ties Incident(10) — type-weight: medical-response(1) < crowd-reroute(4) → incident wins tiebreak at exactly 92%.
5. Reroute(≥93%) < Escort(max=8): reroute at 93%+ outranks max-urgency escort.
6. Reroute(=92%) ties Escort(8) — type-weight: escort(3) < crowd-reroute(4) → escort wins tiebreak at exactly 92%.
7. Escort(max=8) < Incident(high=10): max-urgency escort outranks high incident.
8. Gate(min=21) > Incident(medium=30): most-delayed gate outranks medium incident.

---

## ADR-8: Offline Fallback Architecture

**Status:** Accepted  
**Context:** The hackathon evaluator may not have a Gemini API key. The rules engine must work without credentials.  
**Decision:** Three-layer offline strategy:
1. Rules engine is pure functions with zero API dependencies.
2. Gemini agent falls back to `offline.ts` (keyword-intent routing) on missing key or any API error.
3. Firestore falls back to in-memory Map store automatically.  
**Consequence:** Full demo works offline. Evaluators can run `npm run dev` and see a working system without setting any environment variables.

---

## ADR-9: Simulation Design — Bounded Random Walk

**Status:** Accepted  
**Context:** Need a realistic, demo-ready simulation that doesn't require real sensors.  
**Decision:** Each occupancy signal advances via a bounded random walk (±8% per tick), with a configurable seeded PRNG for test determinism. Gate zones have a positive drift (+2%) to simulate incoming crowds. Weather refreshes every 10 ticks.  
**Consequence:** Tests use `useSeed(n)` for fully deterministic runs. Demo uses `Math.random` for realistic variety.

---

## ADR-10: Security Layering

**Status:** Accepted  
**Decision:**
- Helmet.js strict CSP (no inline scripts, no external script sources)
- Rate limiting: 30/min AI routes (Gemini is expensive), 300/min data routes
- Zod validation on all POST inputs, rejecting unknown keys
- Body size capped at 16KB to prevent DoS
- Input sanitizer strips HTML tags and `javascript:` protocol from all string inputs
- Prompt injection containment: system prompt explicitly instructs Gemini to ignore embedded instructions in user messages
