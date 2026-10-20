# ACE v3.0 Phase 5a Implementation Plan (Fading Policy, mastery-driven)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first fading behavior: scaffolds withdraw as a student's per-concept mastery confidence rises. A student who has mastered the finding-leg concept stops seeing scaffolds on Athens. A student partway through mastery sees scaffolds only after pausing. A novice sees full scaffolds.

**Architecture:** A `FadingPolicy` stage runs in the `consult()` pipeline between F3 (modulator) and F6 (guardrail). It reads a per-student per-concept `fadeLevel` (0.0 to 1.0, computed from `masteryState[concept].confidence`) and decides one of three modes: Full (fire normally), Delayed (fire only after pause threshold), Withdrawn (do not fire). Fade level persists to localStorage with a `qs_fade_` prefix. Phase 5a is mastery-driven only; repetition/tier/decay/override dimensions, weakened/frequency-reduced modes, per-Support-Kind cardinality, un-fading, and D1 persistence are all deferred to later phases.

**Tech Stack:** Vanilla JavaScript, Vitest with jsdom, localStorage. No new dependencies.

**Spec:** [../specs/2026-08-30-ace-scaffolding-lens4-design.md](../specs/2026-08-30-ace-scaffolding-lens4-design.md) (Section 5, Fading Policy)

**Prior phase:** [2026-09-04-ace-v3-phase-4-modulator-guardrail.md](2026-09-04-ace-v3-phase-4-modulator-guardrail.md) (merged as `ecb30b3` on `claude/integrate-triangle-types-activity-v0P98`)

## Scope decisions (Phase 5a vs the full spec Section 5)

| Spec Section 5 element | Phase 5a | Deferred to |
|---|---|---|
| Fade State cardinality | per student × per concept (single `fadeLevel` number) | Phase 5b: per student × per concept × per Support Kind |
| Mastery-driven dimension | YES | |
| Repetition-driven dimension | no | Phase 5b |
| Tier-driven dimension | no | Phase 5b |
| Decay-driven dimension (un-fading) | no | Phase 5c |
| Teacher-override dimension | no | Progressive Authoring phase |
| Full support mode (spec band 0.0 to 0.2) | YES, widened to fade < 0.4 | |
| Weakened mode (spec band 0.2 to 0.5) | no | Phase 5b |
| Delayed mode (spec band 0.5 to 0.7) | YES, widened to 0.4 to 0.8 | |
| Frequency-reduced mode (spec band 0.7 to 0.9) | no | Phase 5b |
| Withdrawn mode (spec band 0.9 to 1.0) | YES, widened to fade >= 0.8 | |
| Persistence | localStorage (`qs_fade_` prefix) | Phase 5c: D1 for teacher visibility |
| Fade State history | no | Phase 5c |

Phase 5a uses 3 modes with simplified boundaries (Full < 0.4, Delayed 0.4 to 0.8, Withdrawn >= 0.8). The spec's 5-mode ladder with finer boundaries is a Phase 5b refinement once real user data shows whether Weakened and Frequency-reduced add value.

## Global Constraints

- **No em-dashes anywhere** in code, comments, commit messages, test descriptions. Absolute per Linda's CLAUDE.md.
- **Banned AI-tell words in all copy**: "honest", "honestly", "quiet", "quietly", "genuinely", "truly", "landed" (as arrival metaphor).
- **Banned AI-tell phrases**: "what is working", "worth [verb]-ing", reveal-list triptychs.
- **Preserve v2 code untouched**: `scaffoldActive`, `fastTrackActive`, `aceChooseRoute()`, `scaffoldChallenges`, `fastTrackVariants`, `enterScaffold()`, `handleFastTrackOffer()`, `.scaffold-panel` CSS, `{scaffoldHint}` templates.
- **Preserve Phase 1-4 API surface**: `window.ScaffoldingFramework` shape unchanged except for the new `FadingPolicy` sub-object. F1, F2, F3, F6, createScaffold, SupportKinds unchanged.
- **Fading reads mastery, never writes it.** `masteryState` and `window.currentUser.mastery_state` are read-only from the framework's perspective. Fade level is derived from confidence; the framework does not update confidence.
- **localStorage key namespace**: `qs_fade_<studentId>_<conceptKey>` to match the existing `qs_` prefix pattern in the codebase. Values are JSON with `{ fadeLevel: number, computedAt: ISO string }`.
- **Delayed mode threshold**: 20000 ms (20 seconds) of time on task before a scaffold fires in Delayed mode. This is a Phase 5a placeholder; real tuning waits for user data.
- **Commit granularity**: each task ends with one commit. Prefix per repo convention. No em-dashes in commit messages.

---

## File Structure

| File | Change | Purpose |
|---|---|---|
| `public/js/scaffolding-framework.js` | Modify Task 1 (~60 lines) | Add `FadingPolicy` sub-object with `computeFadeLevel(confidence)`, `getMode(fadeLevel)`, `apply(scaffold, fadeLevel, performanceEvent)` |
| `public/js/scaffolding-framework.js` | Modify Task 3 (~15 lines) | Update `consult()` to run FadingPolicy.apply between F3 and F6 |
| `public/index.html` | Modify Task 2 (~30 lines) | Add `readFadeLevel(studentId, conceptKey)` and `writeFadeLevel(...)` localStorage helpers; compute and persist fade level from `masteryState` on challenge load |
| `public/index.html` | Modify Task 4 (~5 lines) | Thread `fadeLevel` into `handleIncorrectAnswer`'s consult context |
| `tests/fading-policy.test.js` | Create Task 1 (~120 lines) | Unit tests for computeFadeLevel, getMode, apply |
| `tests/consult-orchestration.test.js` | Extend Task 3 (~50 lines added) | Integration tests for FadingPolicy in the consult pipeline |

---

## Task 1: FadingPolicy sub-object with fade computation and mode logic

**Files:**
- Modify: `public/js/scaffolding-framework.js`. Add a `FadingPolicy` sub-object to `globalThis.ScaffoldingFramework`.
- Create: `tests/fading-policy.test.js`

**Interfaces:**
- Consumes: nothing new (pure functions over inputs)
- Produces: `globalThis.ScaffoldingFramework.FadingPolicy` with three methods:
  - `computeFadeLevel(confidence)`: `number | null` → `number` in [0, 1]. Maps concept mastery confidence to fade level. Phase 5a: identity mapping with clamping (fadeLevel = confidence). Null/invalid input → 0 (full support, safe default).
  - `getMode(fadeLevel)`: `number` → `'full' | 'delayed' | 'withdrawn'`. Boundaries: < 0.4 full; 0.4 to < 0.8 delayed; >= 0.8 withdrawn.
  - `apply(scaffold, fadeLevel, performanceEvent)`: returns `scaffold` (fire), or `null` (withhold). In delayed mode, fires only if `performanceEvent.timeMs >= DELAY_THRESHOLD_MS` (20000). Null fadeLevel → treat as 0 (full).

- [ ] **Step 1.1: Write the failing tests**

Create `tests/fading-policy.test.js`:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('FadingPolicy', () => {
  let FadingPolicy, createScaffold;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    FadingPolicy = globalThis.ScaffoldingFramework.FadingPolicy;
    createScaffold = globalThis.ScaffoldingFramework.createScaffold;
  });

  const scaffold = () => createScaffold({
    supportKind: 'prompt',
    functions: ['F2'],
    payload: { text: 'a prompt' }
  });

  describe('computeFadeLevel', () => {
    it('returns 0 for null confidence (safe default: full support)', () => {
      expect(FadingPolicy.computeFadeLevel(null)).toBe(0);
    });
    it('returns 0 for undefined confidence', () => {
      expect(FadingPolicy.computeFadeLevel(undefined)).toBe(0);
    });
    it('returns 0 for non-numeric confidence', () => {
      expect(FadingPolicy.computeFadeLevel('high')).toBe(0);
    });
    it('returns confidence unchanged when in [0, 1]', () => {
      expect(FadingPolicy.computeFadeLevel(0.5)).toBe(0.5);
      expect(FadingPolicy.computeFadeLevel(0)).toBe(0);
      expect(FadingPolicy.computeFadeLevel(1)).toBe(1);
    });
    it('clamps confidence above 1 to 1', () => {
      expect(FadingPolicy.computeFadeLevel(1.5)).toBe(1);
    });
    it('clamps confidence below 0 to 0', () => {
      expect(FadingPolicy.computeFadeLevel(-0.3)).toBe(0);
    });
  });

  describe('getMode', () => {
    it('returns full for fadeLevel < 0.4', () => {
      expect(FadingPolicy.getMode(0)).toBe('full');
      expect(FadingPolicy.getMode(0.39)).toBe('full');
    });
    it('returns delayed for 0.4 <= fadeLevel < 0.8', () => {
      expect(FadingPolicy.getMode(0.4)).toBe('delayed');
      expect(FadingPolicy.getMode(0.6)).toBe('delayed');
      expect(FadingPolicy.getMode(0.79)).toBe('delayed');
    });
    it('returns withdrawn for fadeLevel >= 0.8', () => {
      expect(FadingPolicy.getMode(0.8)).toBe('withdrawn');
      expect(FadingPolicy.getMode(1)).toBe('withdrawn');
    });
    it('treats null/invalid fadeLevel as full', () => {
      expect(FadingPolicy.getMode(null)).toBe('full');
      expect(FadingPolicy.getMode(undefined)).toBe('full');
      expect(FadingPolicy.getMode('x')).toBe('full');
    });
  });

  describe('apply', () => {
    it('returns scaffold in full mode regardless of time', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.1, { timeMs: 500 })).toBe(s);
      expect(FadingPolicy.apply(s, 0.1, { timeMs: 60000 })).toBe(s);
    });
    it('returns null in withdrawn mode regardless of time', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.9, { timeMs: 500 })).toBeNull();
      expect(FadingPolicy.apply(s, 0.9, { timeMs: 60000 })).toBeNull();
    });
    it('returns null in delayed mode when timeMs is below threshold', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.6, { timeMs: 5000 })).toBeNull();
      expect(FadingPolicy.apply(s, 0.6, { timeMs: 19999 })).toBeNull();
    });
    it('returns scaffold in delayed mode when timeMs meets threshold', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.6, { timeMs: 20000 })).toBe(s);
      expect(FadingPolicy.apply(s, 0.6, { timeMs: 60000 })).toBe(s);
    });
    it('returns null in delayed mode when timeMs is missing (cannot confirm pause)', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.6, {})).toBeNull();
      expect(FadingPolicy.apply(s, 0.6, null)).toBeNull();
    });
    it('treats null fadeLevel as full (fires)', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, null, { timeMs: 500 })).toBe(s);
    });
    it('returns null for null scaffold', () => {
      expect(FadingPolicy.apply(null, 0.1, { timeMs: 500 })).toBeNull();
    });
    it('exposes DELAY_THRESHOLD_MS as 20000', () => {
      expect(FadingPolicy.DELAY_THRESHOLD_MS).toBe(20000);
    });
  });
});
```

- [ ] **Step 1.2: Run tests to see them fail**

Run: `npm test tests/fading-policy.test.js`
Expected: all tests fail (FadingPolicy is undefined).

- [ ] **Step 1.3: Implement FadingPolicy**

In `public/js/scaffolding-framework.js`, inside the `globalThis.ScaffoldingFramework = { ... }` object literal, add a new `FadingPolicy` sub-object AFTER `Functions` and BEFORE `consult`:

```javascript
  // ═══ FADING POLICY (spec Section 5) ═══
  // Phase 5a: mastery-driven only. fadeLevel = clamped concept confidence.
  // Three modes: full (< 0.4), delayed (0.4 to 0.8), withdrawn (>= 0.8).
  // Later phases add repetition/tier/decay/override dimensions, weakened and
  // frequency-reduced modes, per-Support-Kind cardinality, and un-fading.
  FadingPolicy: {
    DELAY_THRESHOLD_MS: 20000,

    // Map concept mastery confidence to a fade level in [0, 1].
    // Phase 5a: identity with clamping. Null or non-numeric -> 0 (full support).
    computeFadeLevel(confidence) {
      if (typeof confidence !== 'number' || Number.isNaN(confidence)) return 0;
      if (confidence < 0) return 0;
      if (confidence > 1) return 1;
      return confidence;
    },

    // Classify a fade level into a mode.
    getMode(fadeLevel) {
      if (typeof fadeLevel !== 'number' || Number.isNaN(fadeLevel)) return 'full';
      if (fadeLevel >= 0.8) return 'withdrawn';
      if (fadeLevel >= 0.4) return 'delayed';
      return 'full';
    },

    // Decide whether a scaffold fires given the fade level and time on task.
    // Returns the scaffold to fire, or null to withhold.
    apply(scaffold, fadeLevel, performanceEvent) {
      if (!scaffold) return null;
      const mode = this.getMode(fadeLevel);
      if (mode === 'full') return scaffold;
      if (mode === 'withdrawn') return null;
      // delayed: fire only after a confirmed pause
      const timeMs = performanceEvent && typeof performanceEvent.timeMs === 'number'
        ? performanceEvent.timeMs
        : null;
      if (timeMs === null) return null;
      return timeMs >= this.DELAY_THRESHOLD_MS ? scaffold : null;
    }
  },
```

Note: `this.getMode` and `this.DELAY_THRESHOLD_MS` work because `apply` is called as `FadingPolicy.apply(...)`. If a later refactor passes `apply` as a detached callback, switch to `globalThis.ScaffoldingFramework.FadingPolicy.getMode(...)`. Phase 5a keeps `this` for brevity.

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npm test tests/fading-policy.test.js`
Expected: all 18 tests pass (6 computeFadeLevel + 4 getMode + 8 apply).

- [ ] **Step 1.5: Run full suite (no regressions)**

Run: `npm test`
Expected: 72 tests pass (54 from prior phases + 18 new).

- [ ] **Step 1.6: Commit**

```bash
git add public/js/scaffolding-framework.js tests/fading-policy.test.js
git commit -m "feat(ace): add FadingPolicy with mastery-driven fade level and three modes"
```

---

## Task 2: localStorage fade helpers and fade computation on challenge load

**Files:**
- Modify: `public/index.html`. Add `readFadeLevel` / `writeFadeLevel` helpers near the existing `qs_` localStorage helpers (around line 6718), and compute/persist fade level in `loadChallenge` (or wherever `aceChooseRoute` is called, around line 4687).

**Interfaces:**
- Consumes: `masteryState` global (line 4660) and `window.currentUser.mastery_state` (populated from D1); `CHALLENGE_CONCEPT_KEY` map (line 4674); `globalThis.ScaffoldingFramework.FadingPolicy.computeFadeLevel`
- Produces:
  - `readFadeLevel(studentId, conceptKey)`: `number | null` from localStorage key `qs_fade_<studentId>_<conceptKey>`
  - `writeFadeLevel(studentId, conceptKey, fadeLevel)`: persists `{ fadeLevel, computedAt }` JSON
  - `window.aceCurrentFadeLevel`: `number | null`, set on each challenge load for the current challenge's concept. Task 4 reads this into the consult context.

- [ ] **Step 2.1: Locate insertion points**

Run:
```
grep -n "localStorage.setItem('qs_'\|function loadChallenge\|aceChooseRoute(idx)\|CHALLENGE_CONCEPT_KEY" public/index.html
```
Confirm the `qs_` helper pattern location and where `aceChooseRoute` is called from `loadChallenge`.

- [ ] **Step 2.2: Add the localStorage fade helpers**

Near the existing `qs_` localStorage helpers (around line 6718), add:

```javascript
// ═══ ACE v3.0 FADE STATE PERSISTENCE (Phase 5a) ═══
// Per-student per-concept fade level, keyed qs_fade_<studentId>_<conceptKey>.
// Phase 5a persists to localStorage only. D1 persistence is a later phase.
function fadeStorageKey(studentId, conceptKey) {
  return 'qs_fade_' + String(studentId || 'anon') + '_' + String(conceptKey);
}

function readFadeLevel(studentId, conceptKey) {
  try {
    const raw = localStorage.getItem(fadeStorageKey(studentId, conceptKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed.fadeLevel === 'number') ? parsed.fadeLevel : null;
  } catch (e) {
    return null;
  }
}

function writeFadeLevel(studentId, conceptKey, fadeLevel) {
  try {
    localStorage.setItem(
      fadeStorageKey(studentId, conceptKey),
      JSON.stringify({ fadeLevel, computedAt: new Date().toISOString() })
    );
  } catch (e) {
    // localStorage unavailable (private mode, quota). Fade falls back to in-memory only.
  }
}
```

- [ ] **Step 2.3: Add the fade level global**

Near `window.aceCheckinState` (Phase 4 Task 1, near the top of the first script block), add:

```javascript
// Fade level for the currently loaded challenge's concept. Set on challenge
// load by computeAndPersistFadeLevel(). Read by handleIncorrectAnswer into
// the consult context. Null until the first challenge loads.
window.aceCurrentFadeLevel = null;
```

- [ ] **Step 2.4: Add the compute-and-persist function**

Near `aceChooseRoute` (around line 4687), add:

```javascript
// Compute the fade level for a challenge's concept from mastery confidence,
// persist it, and expose it as window.aceCurrentFadeLevel.
// Reads masteryState (and window.currentUser.mastery_state as fallback).
function computeAndPersistFadeLevel(idx) {
  const conceptKey = CHALLENGE_CONCEPT_KEY[idx];
  if (!conceptKey) {
    window.aceCurrentFadeLevel = null;
    return;
  }
  const studentId = (window.currentUser && window.currentUser.id) || 'anon';

  // Prefer the live mastery_state from D1 if present; fall back to the
  // in-page masteryState object.
  let confidence = null;
  let state = (window.currentUser && window.currentUser.mastery_state) || null;
  if (typeof state === 'string') {
    try { state = JSON.parse(state); } catch (e) { state = null; }
  }
  if (state && state[conceptKey] && typeof state[conceptKey].confidence === 'number') {
    confidence = state[conceptKey].confidence;
  } else if (masteryState && masteryState[conceptKey] && typeof masteryState[conceptKey].confidence === 'number') {
    confidence = masteryState[conceptKey].confidence;
  }

  const fadeLevel = globalThis.ScaffoldingFramework.FadingPolicy.computeFadeLevel(confidence);
  writeFadeLevel(studentId, conceptKey, fadeLevel);
  window.aceCurrentFadeLevel = fadeLevel;
  console.log('[ACE v3] fade level for', conceptKey, ':', fadeLevel,
    '(mode:', globalThis.ScaffoldingFramework.FadingPolicy.getMode(fadeLevel) + ')');
}
```

- [ ] **Step 2.5: Call it from challenge load**

Find where `aceChooseRoute(idx)` is called inside `loadChallenge` (or equivalent). Immediately after that call, add:

```javascript
  computeAndPersistFadeLevel(idx);
```

If `aceChooseRoute` is not called from a single place, add the `computeAndPersistFadeLevel(idx)` call at the top of `loadChallenge` after `idx` is known. The goal is: every time a challenge is loaded, `window.aceCurrentFadeLevel` reflects that challenge's concept.

- [ ] **Step 2.6: Manual smoke test**

Run `npm run dev`. Sign in as a test student. Open DevTools.

Load Challenge 1 (Athens). Console should show a line like:
`[ACE v3] fade level for finding_leg : 0.35 (mode: full)`
(the number depends on the student's mastery confidence for that concept).

In console:
```javascript
window.aceCurrentFadeLevel
```
Expected: a number in [0, 1] matching the log.

```javascript
localStorage.getItem('qs_fade_<yourStudentId>_finding_leg')
```
Expected: JSON string like `{"fadeLevel":0.35,"computedAt":"2026-09-05T..."}`.

Load a different challenge (Rhodes). Verify the log fires again with `finding_hypotenuse` and `window.aceCurrentFadeLevel` updates.

- [ ] **Step 2.7: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): compute and persist per-concept fade level on challenge load"
```

---

## Task 3: Wire FadingPolicy into consult() pipeline

**Files:**
- Modify: `public/js/scaffolding-framework.js`. Update `consult()` body.
- Extend: `tests/consult-orchestration.test.js` (append a new describe block; do not replace existing tests)

**Interfaces:**
- Consumes: `context.fadeLevel` (number | null | undefined) and `context.performanceEvent` (already present); `FadingPolicy.apply`
- Produces: `consult()` return array now excludes scaffolds withheld by fading

Updated Phase 5a orchestration order:
1. F2 (strategic help)
2. F1 (simplify)
3. F3 modulate each surviving scaffold with `context.affect`
4. **FadingPolicy.apply** each modulated scaffold with `context.fadeLevel` and `context.performanceEvent`; drop nulls
5. F6 guardrail each survivor; keep only `allow === true`
6. Return survivors

Fading sits after F3 and before F6 so that F6 still validates the final text of anything that fires, and so that withheld scaffolds skip the guardrail entirely.

- [ ] **Step 3.1: Extend the orchestration tests**

Append to `tests/consult-orchestration.test.js`:

```javascript
describe('consult orchestration Phase 5a fading', () => {
  let consult;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    consult = globalThis.ScaffoldingFramework.consult;
  });

  const promptSupport = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'base prompt.' } };

  it('fires normally when fadeLevel is missing (full support default)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 1000 }
    });
    expect(scaffolds).toHaveLength(1);
  });

  it('fires normally when fadeLevel is low (full mode)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 1000 },
      fadeLevel: 0.2
    });
    expect(scaffolds).toHaveLength(1);
  });

  it('withholds when fadeLevel is high (withdrawn mode)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 60000 },
      fadeLevel: 0.9
    });
    expect(scaffolds).toHaveLength(0);
  });

  it('withholds in delayed mode before the pause threshold', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 5000 },
      fadeLevel: 0.6
    });
    expect(scaffolds).toHaveLength(0);
  });

  it('fires in delayed mode once the pause threshold is met', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 25000 },
      fadeLevel: 0.6
    });
    expect(scaffolds).toHaveLength(1);
  });

  it('fading runs after F3: a fired scaffold in delayed mode still carries F3 tone', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 25000 },
      fadeLevel: 0.6,
      affect: { mathConfidence: 1 }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].payload.text).toMatch(/^Math can feel tough sometimes\./);
  });

  it('fading applies to F1 scaffolds too', () => {
    const offload = { supportKind: 'offload', functions: ['F1'], payload: { text: 'offload.' } };
    const scaffolds = consult({
      challengeSupports: [offload],
      performanceEvent: { correct: false, attempts: 3, timeMs: 60000 },
      fadeLevel: 0.9
    });
    expect(scaffolds).toHaveLength(0);
  });
});
```

- [ ] **Step 3.2: Run tests to see them fail**

Run: `npm test tests/consult-orchestration.test.js`
Expected: the withhold tests fail (consult currently ignores fadeLevel).

- [ ] **Step 3.3: Update consult()**

In `public/js/scaffolding-framework.js`, replace the `consult` body:

```javascript
consult(context) {
  if (!context || typeof context !== 'object') return [];
  const fns = globalThis.ScaffoldingFramework.Functions;
  const fading = globalThis.ScaffoldingFramework.FadingPolicy;

  // Phase 5a evaluation order (subset of spec Section 4 plus Section 5):
  // F2 -> F1 -> F3 (modulator) -> FadingPolicy -> F6 (guardrail).
  // F4, F5, and Intervention Policy are wired in later phases.

  const producedScaffolds = [];
  const f2Result = fns.F2_strategicHelp(context);
  if (f2Result) producedScaffolds.push(f2Result);
  const f1Result = fns.F1_simplify(context);
  if (f1Result) producedScaffolds.push(f1Result);

  // F3 modulator: adjust tone on each surviving scaffold
  const modulated = producedScaffolds.map(s => fns.F3_offsetFrustration(s, context.affect));

  // Fading: withhold scaffolds the student has faded past
  const faded = modulated
    .map(s => fading.apply(s, context.fadeLevel, context.performanceEvent))
    .filter(s => s !== null);

  // F6 guardrail: filter out scaffolds that violate Principle #1
  const allowed = faded.filter(s => {
    const verdict = fns.F6_learningByDoing(s);
    return verdict.allow;
  });

  return allowed;
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npm test tests/consult-orchestration.test.js`
Expected: all 18 orchestration tests pass (5 Phase 3 + 6 Phase 4 + 7 Phase 5a).

- [ ] **Step 3.5: Run full suite**

Run: `npm test`
Expected: 79 tests pass (72 after Task 1 + 7 new orchestration).

- [ ] **Step 3.6: Commit**

```bash
git add public/js/scaffolding-framework.js tests/consult-orchestration.test.js
git commit -m "feat(ace): wire FadingPolicy into consult pipeline between F3 and F6"
```

---

## Task 4: Thread fadeLevel into consult context

**Files:**
- Modify: `public/index.html`. `handleIncorrectAnswer` consult call (around line 5570).

**Interfaces:**
- Consumes: `window.aceCurrentFadeLevel` (from Task 2)
- Produces: `context.fadeLevel` in the consult call

- [ ] **Step 4.1: Locate the consult call**

Run: `grep -n "ScaffoldingFramework.consult" public/index.html`

- [ ] **Step 4.2: Add fadeLevel to the context**

Add one field to the context object. Do not remove any existing fields (`studentId`, `challengeIdx`, `phase`, `performanceEvent`, `challengeSupports`, `affect`):

```javascript
  fadeLevel: (typeof window.aceCurrentFadeLevel === 'number') ? window.aceCurrentFadeLevel : null
```

- [ ] **Step 4.3: Manual smoke test**

Run `npm run dev`. Two scenarios:

Scenario A (novice, full mode):
- Use a student whose `finding_leg` confidence is below 0.4 (or temporarily set `window.aceCurrentFadeLevel = 0.1` in DevTools before submitting)
- Athens, wrong answer immediately
- Support card renders (Phase 3/4 behavior unchanged)

Scenario B (mastered, withdrawn mode):
- In DevTools before submitting: `window.aceCurrentFadeLevel = 0.9`
- Athens, wrong answer
- No Support card renders. Console still shows `[ACE v3] consult() returned 0 scaffolds`.

Scenario C (partway, delayed mode):
- `window.aceCurrentFadeLevel = 0.6`
- Athens, wrong answer immediately (under 20 s on task) → no card
- Wait 25 s, wrong answer again → card renders

- [ ] **Step 4.4: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): thread aceCurrentFadeLevel into consult context"
```

---

## Task 5: End-to-end verification and push

**Files:** no file changes

- [ ] **Step 5.1: Full test suite**

Run: `npm test`
Expected: 79 tests pass.

- [ ] **Step 5.2: Browser walkthrough**

Run `npm run dev`. With a real signed-in student:
- Load Athens; confirm the fade-level log fires and `window.aceCurrentFadeLevel` matches the student's `finding_leg` confidence
- Submit wrong answers and confirm the Support card behavior matches the mode (full / delayed / withdrawn) for that fade level
- Reload the page; confirm `localStorage` still holds `qs_fade_<id>_finding_leg`
- Confirm Phase 3 and Phase 4 behaviors are intact for a novice (full mode): scaffolds render, F3 tone applies when check-in was completed
- Confirm v2 scaffold-path button and fast-track still trigger where they did before

- [ ] **Step 5.3: Verify branch state and push**

```bash
git status
git log --oneline origin/claude/kind-solomon-9be8a0..HEAD
git push
```

---

## Notes for the executor

- **Fading reads mastery, never writes it.** Do not touch `masteryState`, `window.currentUser.mastery_state`, or any D1 write path in this phase.
- **Do not add repetition, tier, decay, or override logic.** Phase 5a is mastery-driven only. If you see an obvious place to add un-fading, note it in your report and leave it alone.
- **Do not change the three-mode boundaries** (0.4 / 0.8) or the 20000 ms delay threshold. They are placeholders; tuning waits for user data.
- **If `aceChooseRoute` is not called from a single place**, put `computeAndPersistFadeLevel(idx)` at the top of `loadChallenge` instead, and say so in the report.
- **localStorage may be unavailable** (private mode). The helpers swallow errors; fade then works in-memory for the session. Do not add fallbacks beyond what the plan specifies.
- **Rendering does not change in Phase 5a.** Phase 3 Task 7's card rendering already handles an empty scaffold array (no section renders).
