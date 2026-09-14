# ACE v3: Mastery Map Write Path

**Date:** 2026-09-14
**Status:** Design approved in brainstorm (six sections, 2026-09-14). Awaiting spec review, then implementation plan.
**Slot in the rollout:** between Phase 5a (FadingPolicy, shipped 2026-09-13) and Phase 5b. The numbered phases keep their numbers.
**Related:** `2026-08-30-ace-scaffolding-lens4-design.md` (Lens 4), `../plans/2026-09-05-ace-v3-phase-5a-fading-policy.md` (Phase 5a).

---

## 1. Purpose

Phase 5a computes a per-concept fade level from the student's mastery confidence in D1 and threads it through the Lens 4 consult pipeline. On the three HTML challenges (Athens, Rhodes, Alexandria) that confidence never exists, because nothing writes it. The fade level is therefore always 0 (full support) there, the fast-track route never fires, and the teacher dashboard's per-concept card shows only the Samos triangle-type concepts.

This phase gives the Mastery Map (an ACE object, Lens 3) a real write path for those challenges:

1. defines the rule by which a concept's confidence moves after each attempt,
2. makes the progress endpoint merge mastery per concept instead of replacing the whole column,
3. makes the client send the concept with each attempt and refresh its copy of mastery from the reply,
4. removes the automatic scaffold route so the newly live confidence cannot send a student to the easier version of a problem.

Success looks like this: a signed-in student answers Athens, the console logs a mastery line and, on the next load of a challenge with that concept, a non-zero fade level; the teacher's concept card gains a Finding Leg row.

---

## 2. Decisions made in the brainstorm

| # | Question | Decision | Why |
|---|----------|----------|-----|
| Q1 | What counts as evidence of mastery? | Every attempt counts; assisted success counts less; a wrong answer is evidence against every time. | Tabak and Reiser: mastery is unassisted performance. Fading should withdraw support only after success without it. |
| Q2 | Writing mastery wakes the v2 route chooser. Keep it? | Keep fast-track (harder variant at 0.85 and above). Remove the automatic scaffold route (easier version below 0.50). | The scaffold route is the task-decomposition approach the Lens 4 spec rejects and Phase 9 removes. Fast-track raises the challenge rather than lowering it. |
| Rule | Which update rule? | Bayesian knowledge tracing (Corbett and Anderson, 1995) with five fixed parameters. | Standard in intelligent tutoring research, asymmetric in the right direction, and partial credit for assisted answers falls out of the model rather than being bolted on. |

Alternatives considered for the rule: an exponential moving average (simpler to state, but symmetric, and it needs three clean successes before support withdraws; no theory behind the constant) and a running ratio in the Samos style (one clean success reads as certain mastery and withdraws all support on the next problem).

---

## 3. Architecture

```
  student answers on Athens / Rhodes / Alexandria
                 |
                 v
  submitAnswer() -> saveAttemptToD1(ch, idx, isCorrect, val, tracker)
                 |   payload now carries concept_key = challenges[idx].concept
                 v
  POST /api/student/progress            (functions/api/student/progress.ts)
     1. ensure profile row               (unchanged)
     2. insert challenge_attempts row    (unchanged)
     3. bump game_sessions counters      (unchanged)
     4. award XP                         (unchanged)
     5. mastery step                     (rewritten)
          concept_key present   -> read JSON -> applyAttempt() -> write JSON
          mastery_state present -> read JSON -> merge per concept -> write JSON
     6. analytics event                  (unchanged)
     7. respond { ok, profile }          (unchanged shape)
                 |
                 v
  client: window.currentUser.mastery_state = profile.mastery_state
                 |
                 v
  next loadChallenge(idx):
     aceChooseRoute(idx)           reads challenges[idx].concept, fast-track only
     computeAndPersistFadeLevel()  reads the same entry -> FadingPolicy -> aceCurrentFadeLevel
                 |
                 v
  handleIncorrectAnswer -> ScaffoldingFramework.consult({ ..., fadeLevel })   (unchanged)
```

The rule lives in one pure module, `lib/mastery-rule.ts`, imported by the endpoint and by the tests. It sits outside `functions/` because Cloudflare Pages treats every file under `functions/` as a route.

---

## 4. The update rule (`lib/mastery-rule.ts`)

### 4.1 Parameters

One exported object. These five numbers are the only tuning surface.

| Name | Value | Meaning |
|------|-------|---------|
| `prior` | 0.30 | Confidence assumed for a concept with no entry |
| `learn` | 0.20 | Chance the student learns the concept during an attempt |
| `slip` | 0.10 | Chance a student who knows it answers wrong |
| `guess` | 0.20 | Chance a student who does not know it answers right, unassisted |
| `assistedGuess` | 0.50 | Same, when the correct answer was assisted |

### 4.2 Formulas

With `p` the current confidence, `s` slip, `g` guess (or `assistedGuess` for an assisted correct answer), `t` learn:

- After a correct answer: `p_obs = p (1 - s) / ( p (1 - s) + (1 - p) g )`
- After a wrong answer: `p_obs = p s / ( p s + (1 - p)(1 - g) )` with `g` always the plain guess rate
- Then learning: `p_new = p_obs + (1 - p_obs) t`

A wrong answer never uses the assisted guess rate. That is what makes it full evidence against, per Q1.

### 4.3 Worked examples (the approved table)

Every concept starts at 0.30. Stored values are rounded to three decimals; shown here to two.

| Student story | Confidence after |
|---------------|------------------|
| Right first try, no help | 0.73 |
| Then right again, no help, on a second problem | 0.94 |
| Right first try, but used a hint | 0.55 |
| Wrong, then right with a Support card | 0.49 |
| Wrong twice, then right with a Support card | 0.48 |

How the bands read them: FadingPolicy is full below 0.40, delayed from 0.40 to 0.80, withdrawn at 0.80 and above. Fast-track needs 0.85. Dashboard tiers are foundation, extension at 0.70, mastery at 0.90. So one clean success reaches delayed support and the extension tier; a second clean success crosses into withdrawn, mastery, and fast-track; recovering with help climbs only to the edge of delayed.

### 4.4 Exported functions

- `MASTERY_PARAMS`: the object in 4.1.
- `bktUpdate(confidence, { correct, assisted })`: returns the new confidence (a number), applying 4.2.
- `isAssisted({ attemptNumber, hintsUsed, wasScaffold })`: true when `attemptNumber > 1`, or `hintsUsed > 0`, or `wasScaffold` is true. Since Phase 3 every wrong attempt with a support in the pool shows a Support card, so attempt number above 1 carries the Support card signal; no new attempt field is needed.
- `tierFor(confidence)`: `'mastery'` at 0.90 and above, `'extension'` at 0.70 and above, otherwise `'foundation'`. Same cutoffs Samos uses inline today, moved here so there is one definition.
- `applyAttempt(masteryState, attempt)`: takes the parsed mastery object (or null) and one attempt `{ conceptKey, correct, assisted, source, now }`; returns a new object with that one concept entry updated. Never mutates its input, never touches other concepts. Throws on a concept key that fails `validateConceptKey`.
- `validateConceptKey(key)`: true when the key matches `^[a-z][a-z0-9_]{1,40}$`.
- `mergeMasteryPayload(existing, incoming)`: the Samos branch. Returns a new object with `incoming`'s concept entries laid over `existing` per key. Throws when `incoming` is not a plain object, when any key fails validation, or when any value is not a plain object.

### 4.5 Concept entry shape

Matches what Samos already writes, plus one count:

```json
{
  "level": "extension",
  "confidence": 0.727,
  "correct": 1,
  "total": 1,
  "assisted": 0,
  "last_activity": "ch_athens_extension_waters2",
  "updated_at": "2026-09-14T16:02:11.000Z"
}
```

- `correct` and `total` count attempts on this concept; `assisted` counts the correct answers that were assisted.
- `last_activity` is the challenge id of the attempt; `updated_at` is the server's timestamp.
- A missing entry, or an entry whose `confidence` is not a number, starts from `prior` with zero counts.

### 4.6 The clamp

Before updating, an existing confidence is clamped into `[0.02, 0.98]`. Samos can write exactly 1.0 (one activity, all correct), and knowledge tracing from exactly 1.0 or 0.0 can never move again. The clamp keeps any entry updatable. The stored result is not clamped; it can legitimately approach 1.0 over many clean successes.

---

## 5. The server merge (`functions/api/student/progress.ts`)

The POST handler keeps its current steps in order (ensure profile row, insert attempt, bump session counters, award XP, analytics event, respond with the refreshed profile). The mastery step is rewritten with two branches.

### 5.1 HTML challenge branch (`concept_key` present)

1. Validate `concept_key` with `validateConceptKey`. On failure respond `400 { error: 'invalid concept_key' }` before any write.
2. Read `mastery_state` for the user. Parse it; `null`, empty, or malformed JSON becomes `{}` (log a warning for malformed).
3. Compute `assisted = isAssisted({ attemptNumber: attempt_number, hintsUsed: hints_used, wasScaffold: was_scaffold })` on the server. The client sends no assisted flag; it cannot inflate its own mastery.
4. `next = applyAttempt(state, { conceptKey, correct: !!is_correct, assisted, source: challenge_id, now: new Date().toISOString() })`.
5. `UPDATE student_profiles SET mastery_state = ?, updated_at = datetime('now') WHERE user_id = ?`.

### 5.2 Samos branch (`mastery_state` present, no `concept_key`)

1. Validate with `mergeMasteryPayload`'s rules. On failure respond 400 before any write.
2. Read and parse as above.
3. `next = mergeMasteryPayload(state, body.mastery_state)`.
4. Write as above.

Samos keeps computing its own per-concept numbers on the client (a ratio for one activity). This phase only stops it erasing other concepts.

### 5.3 Order and validation timing

Both validations run before step 1 of the handler (before the attempt row is inserted), so a rejected request writes nothing. A payload with neither field behaves exactly as today: the attempt is saved and mastery is untouched. A payload with both fields is rejected with 400; no caller sends both.

### 5.4 Concurrency

Read-modify-write across two requests is not atomic. A student produces one attempt per Submit click, seconds apart, so overlap is unlikely, and a collision costs one lost update on one attempt. Accepted. If it ever matters, the update can move into a single SQL statement.

### 5.5 Response and auth

Response stays `{ ok: true, profile }`; the refreshed profile carries the new mastery JSON as a string. Auth is unchanged: the `qs_session` cookie gate in `functions/_middleware.ts` and the "any signed-in role may write to their own profile" behavior stay as they are.

---

## 6. The client (`public/index.html`)

All changes are in the top-level game code. The nested `loadChallenge` and `submitAnswer` inside the `window.QS` IIFE are the demo shim and are not touched (search by name finds both; the plan will say which is which by line).

### 6.1 Concept on the challenge

Each entry in the `challenges` array gains `concept`:

| idx | Location | `concept` |
|-----|----------|-----------|
| 0 | Samos | `triangle_types` |
| 1 | Athens | `finding_leg` |
| 2 | Rhodes | `finding_hypotenuse` |
| 3 | Alexandria | `pythagorean_triples` |

`aceChooseRoute(idx)` and `computeAndPersistFadeLevel(idx)` read `challenges[idx].concept`. The index-keyed `CHALLENGE_CONCEPT_KEY` map is retired once no reader remains. Fast-track variants inherit the field because they are merged over the base challenge with `Object.assign`.

### 6.2 Attempt payload

`saveAttemptToD1(ch, idx, ...)` adds `concept_key: challenges[idx].concept`, taken from the main challenge at `idx`, not from `ch`. On the side-quest `ch` is the scaffold challenge object (no concept), and the attempt must still count toward the main concept; it arrives with `was_scaffold: true`, so the server scores it as assisted.

### 6.3 Refresh from the reply

Both `saveAttemptToD1` and `saveUnityAttemptToD1` read the reply and, when `data.profile` is present, assign `window.currentUser.mastery_state = data.profile.mastery_state`. From then on the next `loadChallenge` sees current mastery for routing and fading, with no second request and no reload. The save stays fire-and-forget from the submit handler's point of view.

### 6.4 Route chooser

The scaffold branch (`confidence < ACE_SCAFFOLD_THRESHOLD && scaffoldChallenges[idx]` setting `scaffoldActive = true`) is removed from `aceChooseRoute`. Fast-track stays. `ACE_SCAFFOLD_THRESHOLD` goes with it if nothing else reads it. The second-wrong-attempt "try simpler numbers" offer in `handleIncorrectAnswer` and the `scaffoldChallenges` data are untouched until Phase 9.

### 6.5 Console line

After each successful save, log from the parsed reply:

```
[ACE v3] mastery finding_leg: 0.727 (extension)
```

### 6.6 Not touched

The in-page demo `masteryState` object and `updateMasteryAfterCorrect` (they drive the progress-map widgets), the guest path (no identity, no writes, fade key stays `anon`), and `handleIncorrectAnswer` (it keeps reading the fade level computed at load).

---

## 7. Teacher dashboard compatibility

No dashboard code changes. `functions/api/teacher/roster.ts` averages every concept entry's confidence for a student's overall score and groups entries by concept for the class card, reading `level` and `confidence`. The new entries carry both, so the concept card gains Finding Leg, Finding Hypotenuse, and Pythagorean Triples rows once students attempt them.

Accepted consequence: a student's overall average blends Samos ratio values with knowledge-tracing values until Samos is unified (out of scope). Both are on the 0 to 1 scale.

The admin endpoints that return the raw mastery JSON (`recent-attempts.ts`, `students.ts`, `seed-demo.ts`) and the student-facing progress-map widgets are untouched.

---

## 8. Testing and verification

### 8.1 Unit tests on the rule (`tests/mastery-rule.test.js`)

Vitest imports `lib/mastery-rule.ts` directly (vitest transpiles TypeScript; no config change). Cases:

- The five stories in 4.3, asserting the stored three-decimal values.
- A wrong answer from a Samos-written 1.0 moves (the clamp).
- Other concepts are untouched; inputs are not mutated.
- A missing entry, and an entry with a non-numeric confidence, start from the prior with zero counts.
- `isAssisted` truth table (attempt number, hints, side-quest, and none).
- `tierFor` at the boundaries 0.699 / 0.70 / 0.899 / 0.90.
- `validateConceptKey` accepts the four game keys and rejects uppercase, spaces, leading digit, empty, and over-length.
- `mergeMasteryPayload` lays incoming over existing per key, preserves untouched keys, and throws on a non-object payload, a bad key, and a non-object value.

### 8.2 Endpoint logic

The two branches call the pure functions above; the D1 read and write stay thin glue. No Workers test harness is added; there is no precedent in the repo and this phase does not need one.

### 8.3 Build proof

One plan task runs the Pages Functions bundler locally (`npx wrangler pages functions build`) to prove the import from `lib/` outside `functions/` bundles.

### 8.4 Local end to end

Run the site with the local D1 through `wrangler pages dev`, apply `schema.sql` locally, seed a test user and a `sessions` row, and drive an Athens attempt from the preview browser (setting the `qs_session` cookie) and from curl. Assert: the `challenge_attempts` row exists; `student_profiles.mastery_state` holds the expected `finding_leg` entry; the console shows the mastery line; the next load of Athens logs a non-zero fade level. This is the check that proves fading is no longer dormant.

### 8.5 Production check after merge

Guests never write, and signing in with Google is not something the assistant does on the user's behalf. After the merge goes live, Linda signs in, answers Athens, and watches for the mastery console line and the new row on the dashboard concept card. Exact steps are handed over at merge time.

### 8.6 Regression

The existing 79 tests stay green throughout; the FadingPolicy tests are unchanged.

---

## 9. Scope boundary and rollout

### 9.1 Out of scope

- Moving Samos onto the server rule (Unity-side change; later).
- Decay modeling, and fitting the five parameters to real data.
- The `triangle_types` versus `triangle_classification` mismatch in the demo seed (Samos only, cosmetic).
- Guest persistence.
- Phase 9's removal of the side-quest offer and the `scaffoldChallenges` data.
- Backfill from `challenge_attempts` for attempts made before this ships. The rule is replayable (the challenge id encodes the location, which maps to the concept), so a backfill is possible later if a pilot class needs it.
- Teacher-visible assisted counts and real-mastery progress-map widgets for students.

### 9.2 Rollout

- No schema change, no D1 migration: mastery stays in the existing JSON column.
- Backward compatible: an older client sending no `concept_key` saves its attempt exactly as today.
- Delivery as Phases 3 through 5a: implementation plan, subagent-driven development on `claude/kind-solomon-9be8a0`, final review, merge into `claude/integrate-triangle-types-activity-v0P98` with the local merge and push, then the production check in 8.5.
- Phase 5c (persistence and un-fading) becomes meaningful only after this ships, because fade levels start moving.

---

## 10. Risks and first-day expectations

- **Students feel fading for the first time.** After one clean success on a concept, support on that concept arrives after 20 seconds of independent effort instead of at once; after two, it is withdrawn. Intended, but visible.
- **Mixed scales on the dashboard average** until Samos is unified (section 7).
- **One lost update on overlapping writes** (section 5.4). Unlikely at one attempt per click.
- **Bundling an import from outside `functions/`** is new to this repo; 8.3 proves it before anything ships.

---

## Appendix A: derivation of the worked numbers

Parameters: prior 0.30, learn 0.20, slip 0.10, guess 0.20, assisted guess 0.50.

1. Clean correct from 0.30: `p_obs = 0.27 / (0.27 + 0.14) = 0.6585`; `p_new = 0.6585 + 0.3415 x 0.2 = 0.7268`.
2. Second clean correct from 0.7268: `p_obs = 0.6541 / (0.6541 + 0.0546) = 0.9229`; `p_new = 0.9383`.
3. Assisted correct from 0.30: `p_obs = 0.27 / (0.27 + 0.35) = 0.4355`; `p_new = 0.5484`.
4. Wrong from 0.30: `p_obs = 0.03 / (0.03 + 0.56) = 0.0508`; `p_new = 0.2407`. Then assisted correct: `p_obs = 0.2166 / (0.2166 + 0.3797) = 0.3633`; `p_new = 0.4906`.
5. Wrong from 0.2407: `p_obs = 0.0241 / (0.0241 + 0.6074) = 0.0381`; `p_new = 0.2305`. Then assisted correct: `p_obs = 0.2075 / (0.2075 + 0.3848) = 0.3503`; `p_new = 0.4802`.

## Appendix B: payload and entry schemas

Attempt payload (POST `/api/student/progress`), new field last:

```json
{
  "session_id": "sess_1726329731000",
  "challenge_id": "ch_athens_extension_waters2",
  "location": "athens",
  "tier": "Extension Waters",
  "user_answer": "12",
  "is_correct": true,
  "attempt_number": 1,
  "hints_used": 0,
  "time_spent_seconds": 41,
  "was_scaffold": false,
  "was_fast_track": false,
  "xp_awarded": 15,
  "concept_key": "finding_leg"
}
```

Samos payload: unchanged; carries `mastery_state` (object of concept entries) and no `concept_key`.

Concept entry: see 4.5.

## Appendix C: files touched

| File | Change |
|------|--------|
| `lib/mastery-rule.ts` | New. Parameters, `bktUpdate`, `isAssisted`, `tierFor`, `applyAttempt`, `validateConceptKey`, `mergeMasteryPayload`. |
| `functions/api/student/progress.ts` | Mastery step rewritten (5.1 to 5.3); imports the module. |
| `public/index.html` | `concept` on challenges; readers use it; `concept_key` in payload; reply refresh in both save functions; scaffold branch removed from `aceChooseRoute`; console line. |
| `tests/mastery-rule.test.js` | New. Section 8.1. |
| `docs/superpowers/specs/2026-09-14-ace-mastery-map-write-path-design.md` | This document. |
