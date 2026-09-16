# ACE v3 Mastery Map Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three HTML challenges (Athens, Rhodes, Alexandria) write per-concept mastery confidence to D1 through a Bayesian knowledge tracing rule, so Phase 5a fading, fast-track routing, and the teacher dashboard's concept card finally receive real data.

**Architecture:** A pure TypeScript rule module at the repo root (`lib/mastery-rule.ts`) is imported by the progress endpoint and by vitest. The endpoint's mastery step becomes a per-concept read-modify-write with two branches (HTML attempt with `concept_key`, or a Samos `mastery_state` object merged per key) and validates before any write. The client carries the concept on each challenge, sends it with the attempt, refreshes its in-page mastery from the endpoint reply, and no longer selects the easier-version route from confidence.

**Tech Stack:** Cloudflare Pages Functions (TypeScript, D1), vanilla JS single-file front end (`public/index.html`), vitest 1.x with jsdom, wrangler 3.x for local D1 and the local dev server.

**Spec:** `docs/superpowers/specs/2026-09-14-ace-mastery-map-write-path-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- **No em-dashes anywhere.** Not in code, comments, tests, commit messages, console strings, or docs. Use commas, colons, periods, parentheses, or the words "to" and "and". This is absolute.
- **Banned words, never use them anywhere:** "honest", "honestly", "quiet", "quietly", "genuinely", "truly", "landed" (as an arrival metaphor, including "land" and "lands" in that sense). Banned phrasings: "worth noting", "worth flagging", "what is working", "the one move that", "got N things".
- **No schema change and no D1 migration.** Mastery stays in `student_profiles.mastery_state` (JSON text).
- **Rule parameters, verbatim from spec 4.1:** prior 0.30, learn 0.20, slip 0.10, guess 0.20, assistedGuess 0.50. Clamp range for an existing confidence before update: 0.02 to 0.98 (spec 4.6). Stored confidence rounded to three decimals.
- **Tier cutoffs, verbatim from spec 4.4:** `mastery` at 0.90 and above, `extension` at 0.70 and above, otherwise `foundation`.
- **Concept key pattern, verbatim from spec 4.4:** `^[a-z][a-z0-9_]{1,40}$`.
- **Concept keys, verbatim from spec 6.1:** idx 0 `triangle_types`, idx 1 `finding_leg`, idx 2 `finding_hypotenuse`, idx 3 `pythagorean_triples`.
- **Test conventions:** vitest is configured with `include: ['tests/**/*.test.js']` and `globals: true`. New test files are `.js` and import the TypeScript module by relative path without extension; vitest transpiles it. The existing 79 tests must pass at every commit (`npm test`).
- **Do not edit** anything inside the `window.QS = (() => {` IIFE near the bottom of `public/index.html` (it contains a second, unrelated `loadChallenge` and `submitAnswer`), and do not edit `public/js/scaffolding-framework.js`.
- **Line numbers in this plan are anchors from the branch at commit `3f77230`.** Always locate an edit by the quoted text, not by the number; earlier tasks shift later lines.
- **Commits:** one per task at minimum, message in the form shown in each task, ending with the line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Shell:** commands below are bash (the Bash tool). Run them from the worktree root `C:/Users/berna/OneDrive/Documents/GitHub/questsim-ace-rebuild/.claude/worktrees/priceless-mahavira-3652be`. `$TMP` in a command means a scratch directory outside the repo; each such block sets it with `TMP="${TMP:-$(mktemp -d)}"` so it works whether or not you export one first.

---

## File structure

| File | Responsibility |
|------|----------------|
| `lib/mastery-rule.ts` (new) | Pure rule: parameters, knowledge tracing update, tier cutoffs, assisted rule, concept key validation, `applyAttempt`, `validateMasteryPayload`, `mergeMasteryPayload`. No imports. |
| `tests/mastery-rule.test.js` (new) | Unit tests for everything in the module (spec 8.1). |
| `functions/api/student/progress.ts` (modify) | Mastery step rewritten to the two branches (spec 5). Thin D1 glue only. |
| `public/index.html` (modify) | `concept` on each challenge, readers use it, index map retired, automatic scaffold route removed, `concept_key` in the attempt payload, reply refresh, console line (spec 6). |

---

### Task 1: Rule module foundations

**Files:**
- Create: `lib/mastery-rule.ts`
- Create: `tests/mastery-rule.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2, 3):
  - `MASTERY_PARAMS: { prior: number; learn: number; slip: number; guess: number; assistedGuess: number }`
  - `CONFIDENCE_FLOOR = 0.02`, `CONFIDENCE_CEILING = 0.98`
  - `CONCEPT_KEY_PATTERN: RegExp`
  - `type MasteryLevel = 'foundation' | 'extension' | 'mastery'`
  - `clampConfidence(p: number): number`
  - `round3(n: number): number`
  - `bktUpdate(confidence: number, obs: { correct: boolean; assisted: boolean }): number` (returns unrounded)
  - `tierFor(confidence: number): MasteryLevel`
  - `isAssisted(a: { attemptNumber?: number; hintsUsed?: number; wasScaffold?: boolean }): boolean`
  - `validateConceptKey(key: unknown): key is string`

- [ ] **Step 1: Write the failing tests**

Create `tests/mastery-rule.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  MASTERY_PARAMS,
  CONFIDENCE_FLOOR,
  CONFIDENCE_CEILING,
  clampConfidence,
  round3,
  bktUpdate,
  tierFor,
  isAssisted,
  validateConceptKey,
} from '../lib/mastery-rule';

describe('MASTERY_PARAMS', () => {
  it('carries the five approved values', () => {
    expect(MASTERY_PARAMS).toEqual({
      prior: 0.30, learn: 0.20, slip: 0.10, guess: 0.20, assistedGuess: 0.50,
    });
  });
  it('is frozen', () => {
    expect(Object.isFrozen(MASTERY_PARAMS)).toBe(true);
  });
});

describe('clampConfidence', () => {
  it('leaves values inside the range alone', () => {
    expect(clampConfidence(0.5)).toBe(0.5);
  });
  it('raises 0 and 1 into the open interval', () => {
    expect(clampConfidence(0)).toBe(CONFIDENCE_FLOOR);
    expect(clampConfidence(1)).toBe(CONFIDENCE_CEILING);
  });
  it('treats a non-finite number as the prior', () => {
    expect(clampConfidence(NaN)).toBe(MASTERY_PARAMS.prior);
    expect(clampConfidence(Infinity)).toBe(MASTERY_PARAMS.prior);
  });
});

describe('round3', () => {
  it('rounds to three decimals', () => {
    expect(round3(0.726829)).toBe(0.727);
    expect(round3(0.9383)).toBe(0.938);
    expect(round3(0.5)).toBe(0.5);
  });
});

describe('bktUpdate', () => {
  it('moves a clean correct answer from the prior to about 0.727', () => {
    expect(bktUpdate(0.30, { correct: true, assisted: false })).toBeCloseTo(0.7268, 3);
  });
  it('moves an assisted correct answer from the prior to about 0.548', () => {
    expect(bktUpdate(0.30, { correct: true, assisted: true })).toBeCloseTo(0.5484, 3);
  });
  it('moves a wrong answer from the prior down to about 0.241', () => {
    expect(bktUpdate(0.30, { correct: false, assisted: false })).toBeCloseTo(0.2407, 3);
  });
  it('treats a wrong answer the same whether or not assisted', () => {
    const plain = bktUpdate(0.30, { correct: false, assisted: false });
    const assisted = bktUpdate(0.30, { correct: false, assisted: true });
    expect(assisted).toBe(plain);
  });
  it('still moves after a wrong answer from a Samos-written 1.0 (the clamp)', () => {
    const next = bktUpdate(1.0, { correct: false, assisted: false });
    expect(next).toBeLessThan(0.98);
    expect(next).toBeCloseTo(0.8877, 3);
  });
});

describe('tierFor', () => {
  it('uses the 0.70 and 0.90 cutoffs', () => {
    expect(tierFor(0.699)).toBe('foundation');
    expect(tierFor(0.70)).toBe('extension');
    expect(tierFor(0.899)).toBe('extension');
    expect(tierFor(0.90)).toBe('mastery');
  });
});

describe('isAssisted', () => {
  it('is false on a first attempt with no hint and no side quest', () => {
    expect(isAssisted({ attemptNumber: 1, hintsUsed: 0, wasScaffold: false })).toBe(false);
  });
  it('is true when the attempt number is above 1', () => {
    expect(isAssisted({ attemptNumber: 2, hintsUsed: 0, wasScaffold: false })).toBe(true);
  });
  it('is true when a hint was used', () => {
    expect(isAssisted({ attemptNumber: 1, hintsUsed: 1, wasScaffold: false })).toBe(true);
  });
  it('is true on the side quest', () => {
    expect(isAssisted({ attemptNumber: 1, hintsUsed: 0, wasScaffold: true })).toBe(true);
  });
  it('is false when every field is missing', () => {
    expect(isAssisted({})).toBe(false);
  });
});

describe('validateConceptKey', () => {
  it('accepts the four game keys and the Samos keys', () => {
    for (const k of ['triangle_types', 'finding_leg', 'finding_hypotenuse', 'pythagorean_triples',
                     'equilateral', 'right', 'isosceles', 'scalene']) {
      expect(validateConceptKey(k)).toBe(true);
    }
  });
  it('rejects uppercase, spaces, a leading digit, empty, one character, over-length, and non-strings', () => {
    expect(validateConceptKey('Finding_Leg')).toBe(false);
    expect(validateConceptKey('finding leg')).toBe(false);
    expect(validateConceptKey('1finding')).toBe(false);
    expect(validateConceptKey('')).toBe(false);
    expect(validateConceptKey('a')).toBe(false);
    expect(validateConceptKey('a' + 'b'.repeat(41))).toBe(false);
    expect(validateConceptKey(null)).toBe(false);
    expect(validateConceptKey(42)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/mastery-rule.test.js`
Expected: FAIL. The error names the missing module `../lib/mastery-rule`.

- [ ] **Step 3: Write the module**

Create `lib/mastery-rule.ts`:

```ts
// Mastery Map update rule (ACE v3, Lens 3 object).
// Pure module: no Cloudflare, DOM, or Node imports, so the progress endpoint
// and vitest both import it. Lives outside functions/ because Cloudflare
// Pages treats every file under functions/ as a route.
// Spec: docs/superpowers/specs/2026-09-14-ace-mastery-map-write-path-design.md

export const MASTERY_PARAMS = Object.freeze({
  prior: 0.30,         // confidence assumed for a concept with no entry
  learn: 0.20,         // chance the student learns the concept during an attempt
  slip: 0.10,          // chance a student who knows it answers wrong
  guess: 0.20,         // chance a student who does not know it answers right, unassisted
  assistedGuess: 0.50, // same, when the correct answer was assisted
});

export const CONFIDENCE_FLOOR = 0.02;
export const CONFIDENCE_CEILING = 0.98;
export const CONCEPT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;

export type MasteryLevel = 'foundation' | 'extension' | 'mastery';

export interface AttemptObservation {
  correct: boolean;
  assisted: boolean;
}

export interface AssistanceInputs {
  attemptNumber?: number;
  hintsUsed?: number;
  wasScaffold?: boolean;
}

// Keep an existing confidence inside the open interval so knowledge tracing
// can always move it. Samos writes exactly 1.0 for a perfect activity, and
// from exactly 1.0 or 0.0 the update below would never move again.
export function clampConfidence(p: number): number {
  if (typeof p !== 'number' || !Number.isFinite(p)) return MASTERY_PARAMS.prior;
  if (p < CONFIDENCE_FLOOR) return CONFIDENCE_FLOOR;
  if (p > CONFIDENCE_CEILING) return CONFIDENCE_CEILING;
  return p;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Bayesian knowledge tracing, one observation.
// A correct answer uses the assisted guess rate when assisted. A wrong answer
// always uses the plain guess rate: it is full evidence against every time.
export function bktUpdate(confidence: number, obs: AttemptObservation): number {
  const { learn, slip, guess, assistedGuess } = MASTERY_PARAMS;
  const p = clampConfidence(confidence);
  let pObs: number;
  if (obs.correct) {
    const g = obs.assisted ? assistedGuess : guess;
    pObs = (p * (1 - slip)) / (p * (1 - slip) + (1 - p) * g);
  } else {
    pObs = (p * slip) / (p * slip + (1 - p) * (1 - guess));
  }
  return pObs + (1 - pObs) * learn;
}

// Same cutoffs the Samos client code uses inline; this is the one definition.
export function tierFor(confidence: number): MasteryLevel {
  if (confidence >= 0.90) return 'mastery';
  if (confidence >= 0.70) return 'extension';
  return 'foundation';
}

// Assisted means the answer came after a wrong attempt (every wrong attempt
// with a support in the pool shows a Support card since Phase 3), after a
// hint, or on the side quest.
export function isAssisted(a: AssistanceInputs): boolean {
  const attemptNumber = typeof a.attemptNumber === 'number' ? a.attemptNumber : 1;
  const hintsUsed = typeof a.hintsUsed === 'number' ? a.hintsUsed : 0;
  return attemptNumber > 1 || hintsUsed > 0 || a.wasScaffold === true;
}

export function validateConceptKey(key: unknown): key is string {
  return typeof key === 'string' && CONCEPT_KEY_PATTERN.test(key);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/mastery-rule.test.js`
Expected: PASS, 19 tests.

Then run the whole suite: `npm test`
Expected: 8 test files, 98 tests passing (79 existing plus 19 new).

- [ ] **Step 5: Commit**

```bash
git add lib/mastery-rule.ts tests/mastery-rule.test.js
git commit -F - <<'MSG'
feat(mastery): knowledge tracing rule module with parameters and helpers

Adds lib/mastery-rule.ts (pure, no imports) with the five approved
parameters, the clamp, bktUpdate, tierFor, isAssisted and
validateConceptKey, plus unit tests.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: applyAttempt and the Samos merge

**Files:**
- Modify: `lib/mastery-rule.ts` (append)
- Modify: `tests/mastery-rule.test.js` (append)

**Interfaces:**
- Consumes (Task 1): `MASTERY_PARAMS`, `bktUpdate`, `round3`, `tierFor`, `validateConceptKey`.
- Produces (used by Task 3):
  - `interface ConceptEntry { level: MasteryLevel; confidence: number; correct: number; total: number; assisted: number; last_activity: string | null; updated_at: string }`
  - `type MasteryState = Record<string, ConceptEntry>`
  - `interface MasteryAttempt { conceptKey: string; correct: boolean; assisted: boolean; source: string | null; now: string }`
  - `applyAttempt(state: MasteryState | null | undefined, attempt: MasteryAttempt): MasteryState` (new object; throws `Error` on an invalid key)
  - `validateMasteryPayload(incoming: unknown): string | null` (an error message, or null when valid)
  - `mergeMasteryPayload(existing: MasteryState | null | undefined, incoming: unknown): MasteryState` (new object; throws `Error` with the validation message)

- [ ] **Step 1: Write the failing tests**

Append to `tests/mastery-rule.test.js` (add the three names to the import list at the top: `applyAttempt`, `validateMasteryPayload`, `mergeMasteryPayload`):

```js
describe('applyAttempt', () => {
  const NOW = '2026-09-16T18:00:00.000Z';
  const clean = (key) => ({ conceptKey: key, correct: true, assisted: false, source: 'ch_athens_extension_waters2', now: NOW });
  const helped = (key) => ({ conceptKey: key, correct: true, assisted: true, source: 'ch_athens_extension_waters2', now: NOW });
  const wrong = (key) => ({ conceptKey: key, correct: false, assisted: false, source: 'ch_athens_extension_waters2', now: NOW });

  it('story 1: right first try, no help, reaches 0.727 and the extension tier', () => {
    const s = applyAttempt(null, clean('finding_leg'));
    expect(s.finding_leg).toEqual({
      level: 'extension', confidence: 0.727, correct: 1, total: 1, assisted: 0,
      last_activity: 'ch_athens_extension_waters2', updated_at: NOW,
    });
  });

  it('story 2: a second clean success reaches 0.938 and mastery', () => {
    const s1 = applyAttempt(null, clean('finding_leg'));
    const s2 = applyAttempt(s1, clean('finding_leg'));
    expect(s2.finding_leg.confidence).toBe(0.938);
    expect(s2.finding_leg.level).toBe('mastery');
    expect(s2.finding_leg.correct).toBe(2);
    expect(s2.finding_leg.total).toBe(2);
  });

  it('story 3: right first try with a hint reaches 0.548', () => {
    const s = applyAttempt({}, helped('finding_leg'));
    expect(s.finding_leg.confidence).toBe(0.548);
    expect(s.finding_leg.level).toBe('foundation');
    expect(s.finding_leg.assisted).toBe(1);
  });

  it('story 4: wrong, then right with a Support card, ends at 0.491', () => {
    const s1 = applyAttempt(null, wrong('finding_leg'));
    expect(s1.finding_leg.confidence).toBe(0.241);
    expect(s1.finding_leg.correct).toBe(0);
    expect(s1.finding_leg.total).toBe(1);
    const s2 = applyAttempt(s1, helped('finding_leg'));
    expect(s2.finding_leg.confidence).toBe(0.491);
    expect(s2.finding_leg).toMatchObject({ correct: 1, total: 2, assisted: 1, level: 'foundation' });
  });

  it('story 5: wrong twice, then right with a Support card, ends at 0.481', () => {
    let s = applyAttempt(null, wrong('finding_leg'));
    s = applyAttempt(s, wrong('finding_leg'));
    expect(s.finding_leg.confidence).toBe(0.231);
    s = applyAttempt(s, helped('finding_leg'));
    expect(s.finding_leg.confidence).toBe(0.481);
    expect(s.finding_leg.total).toBe(3);
  });

  it('a Samos-written 1.0 still moves after a wrong answer', () => {
    const existing = { triangle_types: { level: 'mastery', confidence: 1.0, correct: 4, total: 4, last_activity: 'samos_types', updated_at: NOW } };
    const s = applyAttempt(existing, wrong('triangle_types'));
    expect(s.triangle_types.confidence).toBe(0.888);
    expect(s.triangle_types.total).toBe(5);
  });

  it('leaves other concepts untouched and does not mutate its input', () => {
    const existing = { finding_hypotenuse: { level: 'foundation', confidence: 0.3, correct: 0, total: 1, assisted: 0, last_activity: null, updated_at: NOW } };
    const frozen = JSON.stringify(existing);
    const s = applyAttempt(existing, clean('finding_leg'));
    expect(s.finding_hypotenuse).toBe(existing.finding_hypotenuse);
    expect(JSON.stringify(existing)).toBe(frozen);
    expect(s).not.toBe(existing);
  });

  it('starts from the prior with zero counts when the entry has no numeric confidence', () => {
    const existing = { finding_leg: { level: 'foundation', confidence: 'high', correct: 7, total: 9 } };
    const s = applyAttempt(existing, clean('finding_leg'));
    expect(s.finding_leg.confidence).toBe(0.727);
    expect(s.finding_leg.correct).toBe(1);
    expect(s.finding_leg.total).toBe(1);
  });

  it('accepts a null source', () => {
    const s = applyAttempt(null, { conceptKey: 'finding_leg', correct: true, assisted: false, source: null, now: NOW });
    expect(s.finding_leg.last_activity).toBeNull();
  });

  it('throws on an invalid concept key', () => {
    expect(() => applyAttempt(null, clean('Finding Leg'))).toThrow(/concept key/);
  });
});

describe('validateMasteryPayload', () => {
  it('returns null for a valid Samos-style object', () => {
    expect(validateMasteryPayload({ triangle_types: { level: 'mastery', confidence: 1 }, right: { confidence: 0.5 } })).toBeNull();
  });
  it('rejects a non-object, an array, a bad key, and a non-object value', () => {
    expect(validateMasteryPayload('x')).toMatch(/object/);
    expect(validateMasteryPayload([1])).toMatch(/object/);
    expect(validateMasteryPayload({ 'Bad Key': {} })).toMatch(/Bad Key/);
    expect(validateMasteryPayload({ right: 0.5 })).toMatch(/right/);
  });
});

describe('mergeMasteryPayload', () => {
  it('lays incoming entries over existing ones per key and preserves untouched keys', () => {
    const existing = { finding_leg: { confidence: 0.727 }, triangle_types: { confidence: 0.5 } };
    const incoming = { triangle_types: { confidence: 1 }, scalene: { confidence: 0.75 } };
    const merged = mergeMasteryPayload(existing, incoming);
    expect(merged).toEqual({
      finding_leg: { confidence: 0.727 },
      triangle_types: { confidence: 1 },
      scalene: { confidence: 0.75 },
    });
    expect(existing.triangle_types.confidence).toBe(0.5);
  });
  it('treats a null existing state as empty', () => {
    expect(mergeMasteryPayload(null, { right: { confidence: 0.2 } })).toEqual({ right: { confidence: 0.2 } });
  });
  it('throws with the validation message', () => {
    expect(() => mergeMasteryPayload({}, { 'Bad Key': {} })).toThrow(/Bad Key/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/mastery-rule.test.js`
Expected: FAIL. The new describes fail because `applyAttempt`, `validateMasteryPayload`, and `mergeMasteryPayload` are not exported.

- [ ] **Step 3: Append the implementation**

Append to `lib/mastery-rule.ts`:

```ts
export interface ConceptEntry {
  level: MasteryLevel;
  confidence: number;
  correct: number;
  total: number;
  assisted: number;
  last_activity: string | null;
  updated_at: string;
}

export type MasteryState = Record<string, ConceptEntry>;

export interface MasteryAttempt {
  conceptKey: string;
  correct: boolean;
  assisted: boolean;
  source: string | null;
  now: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function countOf(v: unknown): number {
  return (typeof v === 'number' && Number.isFinite(v) && v > 0) ? Math.floor(v) : 0;
}

// One attempt on one concept. Returns a new state object; never mutates the
// input and never touches other concepts. A missing entry, or one whose
// confidence is not a finite number, starts from the prior with zero counts.
export function applyAttempt(state: MasteryState | null | undefined, attempt: MasteryAttempt): MasteryState {
  if (!validateConceptKey(attempt.conceptKey)) {
    throw new Error('invalid concept key: ' + String(attempt.conceptKey));
  }
  const base: MasteryState = isPlainObject(state) ? (state as MasteryState) : {};
  const prev = base[attempt.conceptKey] as Partial<ConceptEntry> | undefined;
  const usable = isPlainObject(prev)
    && typeof prev.confidence === 'number'
    && Number.isFinite(prev.confidence);

  const startConfidence = usable ? (prev as ConceptEntry).confidence : MASTERY_PARAMS.prior;
  const priorCorrect = usable ? countOf(prev!.correct) : 0;
  const priorTotal = usable ? countOf(prev!.total) : 0;
  const priorAssisted = usable ? countOf(prev!.assisted) : 0;

  const confidence = round3(bktUpdate(startConfidence, { correct: attempt.correct, assisted: attempt.assisted }));

  const entry: ConceptEntry = {
    level: tierFor(confidence),
    confidence,
    correct: priorCorrect + (attempt.correct ? 1 : 0),
    total: priorTotal + 1,
    assisted: priorAssisted + (attempt.correct && attempt.assisted ? 1 : 0),
    last_activity: attempt.source ?? null,
    updated_at: attempt.now,
  };

  return { ...base, [attempt.conceptKey]: entry };
}

// Validation for a Samos-style mastery_state payload. Returns an error
// message, or null when the payload is acceptable.
export function validateMasteryPayload(incoming: unknown): string | null {
  if (!isPlainObject(incoming)) return 'mastery_state must be an object';
  for (const [key, value] of Object.entries(incoming)) {
    if (!validateConceptKey(key)) return 'invalid concept key in mastery_state: ' + key;
    if (!isPlainObject(value)) return 'mastery_state entry must be an object: ' + key;
  }
  return null;
}

// The Samos branch: lay incoming concept entries over the existing state per
// key, so a Samos write no longer erases concepts written by other paths.
export function mergeMasteryPayload(existing: MasteryState | null | undefined, incoming: unknown): MasteryState {
  const problem = validateMasteryPayload(incoming);
  if (problem) throw new Error(problem);
  const base: MasteryState = isPlainObject(existing) ? (existing as MasteryState) : {};
  const out: MasteryState = { ...base };
  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    out[key] = value as ConceptEntry;
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/mastery-rule.test.js`
Expected: PASS, 34 tests (19 from Task 1 plus 15 new).

Then: `npm test`
Expected: 8 files, 113 tests passing.

If a story value is off by exactly one thousandth, the cause is float rounding at the third decimal in an intermediate stored value; check the arithmetic in spec Appendix A before changing any expected number, and never change a parameter to make a test pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mastery-rule.ts tests/mastery-rule.test.js
git commit -F - <<'MSG'
feat(mastery): applyAttempt, payload validation and per-concept merge

applyAttempt updates one concept entry from one attempt through the
knowledge tracing rule and returns a new state. mergeMasteryPayload lays
a Samos-style object over the existing state per key. Both validated,
both covered by the five approved student stories.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: Progress endpoint mastery step

**Files:**
- Modify: `functions/api/student/progress.ts` (lines 29-114 of the current file; the GET handler at lines 4-27 is untouched)

**Interfaces:**
- Consumes (Tasks 1, 2): `applyAttempt`, `isAssisted`, `mergeMasteryPayload`, `validateConceptKey`, `validateMasteryPayload`, type `MasteryState`, from `../../../lib/mastery-rule`.
- Produces (used by Task 5): the POST accepts an optional `concept_key` string; the reply is unchanged, `{ ok: true, profile }`, where `profile.mastery_state` is the refreshed JSON string.

- [ ] **Step 1: Add the import and a read helper**

At the top of `functions/api/student/progress.ts`, after the existing `import type { Env, DataContext } from '../../types';` line, add:

```ts
import {
  applyAttempt,
  isAssisted,
  mergeMasteryPayload,
  validateConceptKey,
  validateMasteryPayload,
} from '../../../lib/mastery-rule';
import type { MasteryState } from '../../../lib/mastery-rule';

// Read and parse the student's mastery JSON. Null, empty, or malformed
// becomes an empty object (malformed is logged so it is not silent).
async function readMasteryState(db: D1Database, userId: number): Promise<MasteryState> {
  const row = await db.prepare('SELECT mastery_state FROM student_profiles WHERE user_id = ?')
    .bind(userId).first<{ mastery_state: string | null }>();
  const raw = row?.mastery_state;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as MasteryState : {};
  } catch (e) {
    console.warn('[progress] malformed mastery_state for user', userId, 'treated as empty');
    return {};
  }
}
```

- [ ] **Step 2: Validate before any write**

In `onRequestPost`, directly after the destructuring block that ends with `xp_awarded = 0,` `} = body;`, and before the `INSERT OR IGNORE INTO student_profiles` statement, add:

```ts
  // Mastery inputs are validated here, before the attempt row is inserted,
  // so a rejected request writes nothing (spec 5.3).
  const conceptKey: unknown = body.concept_key;
  const hasConceptKey = conceptKey !== undefined && conceptKey !== null;
  const hasMasteryPayload = body.mastery_state !== undefined && body.mastery_state !== null;
  if (hasConceptKey && hasMasteryPayload) {
    return Response.json({ error: 'send concept_key or mastery_state, not both' }, { status: 400 });
  }
  if (hasConceptKey && !validateConceptKey(conceptKey)) {
    return Response.json({ error: 'invalid concept_key' }, { status: 400 });
  }
  if (hasMasteryPayload) {
    const problem = validateMasteryPayload(body.mastery_state);
    if (problem) return Response.json({ error: problem }, { status: 400 });
  }
```

- [ ] **Step 3: Replace the mastery step**

Replace this block (currently lines 89-93):

```ts
  // Update mastery/quest state if provided
  if (body.mastery_state) {
    await db.prepare('UPDATE student_profiles SET mastery_state = ?, updated_at = datetime("now") WHERE user_id = ?')
      .bind(JSON.stringify(body.mastery_state), user.id).run();
  }
```

with:

```ts
  // Mastery step (spec 5). Two branches, one write:
  //   concept_key present   -> one attempt through the knowledge tracing rule
  //   mastery_state present -> Samos-style object merged per concept key
  // Read-modify-write; a collision between two overlapping requests costs one
  // lost update on one attempt (spec 5.4, accepted).
  if (hasConceptKey || hasMasteryPayload) {
    const current = await readMasteryState(db, user.id);
    const next = hasConceptKey
      ? applyAttempt(current, {
          conceptKey: conceptKey as string,
          correct: !!is_correct,
          assisted: isAssisted({
            attemptNumber: Number(attempt_number),
            hintsUsed: Number(hints_used),
            wasScaffold: !!was_scaffold,
          }),
          source: typeof challenge_id === 'string' ? challenge_id : null,
          now: new Date().toISOString(),
        })
      : mergeMasteryPayload(current, body.mastery_state);
    await db.prepare('UPDATE student_profiles SET mastery_state = ?, updated_at = datetime("now") WHERE user_id = ?')
      .bind(JSON.stringify(next), user.id).run();
  }
```

Leave the `quest_state` block that follows it exactly as it is.

- [ ] **Step 4: Fix two rule violations in comments you are already next to**

Both are in the same file and both break the global constraints (one uses the banned arrival metaphor, one uses an em-dash), so they go in this task. Neither old text is reproduced here; locate each by position.

The four-line comment directly above the `INSERT OR IGNORE INTO student_profiles` statement ends with the words `would never` followed by a four-letter verb. Replace that whole comment with:

```ts
  // Ensure a student_profiles row exists for this user before any UPDATE
  // statements below. Admins/teachers playing through in test mode won't
  // have had one seeded, and D1 UPDATEs against a missing row silently
  // affect zero rows, so mastery_state would never be written.
```

The three-line comment directly above `if (is_correct && xp_awarded > 0) {` begins `// Update student profile.` and its second line starts with an em-dash. Replace that whole comment with:

```ts
  // Update student profile. Level is an integer computed as floor(xp/100)+1.
  // CAST forces integer division so 20 XP yields level 1 (not 1.2),
  // 100 XP yields level 2, 250 XP yields level 3, etc.
```

- [ ] **Step 5: Prove the bundle builds with the import from outside functions/**

Run:

```bash
TMP="${TMP:-$(mktemp -d)}"; OUT="$TMP/pages-fn-build"; rm -rf "$OUT"; mkdir -p "$OUT"
npx wrangler pages functions build --outdir="$OUT" 2>&1 | tail -5
grep -rl "invalid concept_key" "$OUT" && echo "BUNDLE CONTAINS THE MASTERY STEP"
grep -rl "assistedGuess" "$OUT" && echo "BUNDLE CONTAINS THE RULE MODULE"
```

Expected: the build finishes without errors and both grep lines print a file path. If `--outdir` is rejected by the installed wrangler, run `npx wrangler pages functions build --help` and use the equivalent output flag it lists; the grep assertions are the requirement, not the flag spelling.

Also confirm the file has no em-dash left: `grep -c $'\xe2\x80\x94' functions/api/student/progress.ts` prints `0`.

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: 113 tests passing (nothing in the suite imports the endpoint; this confirms the module edits in Tasks 1 and 2 are still sound).

- [ ] **Step 7: Commit**

```bash
git add functions/api/student/progress.ts
git commit -F - <<'MSG'
feat(progress): merge mastery per concept and score HTML attempts

The mastery step now reads the student's mastery JSON and either applies
one attempt through the knowledge tracing rule (concept_key) or lays a
Samos-style object over it per key (mastery_state). Both inputs are
validated before any row is written. Assisted is computed on the server
from attempt_number, hints_used and was_scaffold.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: Concept on the challenge, readers, and the route chooser

**Files:**
- Modify: `public/index.html` (challenge entries near lines 3402, 3443, 3488, 3528; the concept map and route chooser near lines 4678-4733; `computeAndPersistFadeLevel` near line 4776; the routing comment in `loadChallenge` near lines 4967-4973)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by Task 5): every entry of the top-level `challenges` array has a string `concept` field; `aceChooseRoute(idx)` and `computeAndPersistFadeLevel(idx)` read `challenges[idx].concept`; `CHALLENGE_CONCEPT_KEY` and `ACE_SCAFFOLD_THRESHOLD` no longer exist.

- [ ] **Step 1: Add `concept` to the four challenge entries**

In the top-level `const challenges = [` array (starts at the line `// ═══ CHALLENGE DATA ═══`), each entry begins with a unique `num: N, total: 4,` line. Insert a `concept` line directly after each:

After `    num: 1, total: 4,` insert:
```js
    concept: "triangle_types",
```
After `    num: 2, total: 4,` insert:
```js
    concept: "finding_leg",
```
After `    num: 3, total: 4,` insert:
```js
    concept: "finding_hypotenuse",
```
After `    num: 4, total: 4,` insert:
```js
    concept: "pythagorean_triples",
```

Check: `grep -c '^    concept: "' public/index.html` prints `4`. (The `fastTrackVariants` and `scaffoldChallenges` objects further down also have entries, but none begins with `num: N, total: 4,` at four-space indentation; verify you edited only inside `challenges`.)

- [ ] **Step 2: Retire the index map and the scaffold threshold**

Replace the eight-line block (currently lines 4678-4685) that begins with `const CHALLENGE_CONCEPT_KEY = {` (four entries mapping idx 0 to 3 to the concept keys, each with a trailing comment that contains an em-dash, so the old lines are not reproduced here) and ends with the two lines `const ACE_FASTTRACK_THRESHOLD = 0.85;` and `const ACE_SCAFFOLD_THRESHOLD  = 0.50;` with:

```js
// Each challenge carries its own concept key (see the challenges array).
// Read it with challengeConceptKey(idx). The former index-keyed map was
// retired with the Mastery Map write path so a challenge is authored in one
// place, concept included.
function challengeConceptKey(idx) {
  const ch = challenges[idx];
  return (ch && typeof ch.concept === 'string') ? ch.concept : null;
}
const ACE_FASTTRACK_THRESHOLD = 0.85;
```

- [ ] **Step 3: Rewrite `aceChooseRoute` without the scaffold branch**

Replace the whole function and the comment above it (currently lines 4687-4733: from the comment line `// Called at the start of loadChallenge(). Reads window.currentUser.mastery_state` through the function's closing `}`, which is the line after the final `console.log('[ACE] Normal route for idx', idx,` call and its continuation line) with:

```js
// Called at the start of loadChallenge(). Reads window.currentUser.mastery_state
// (populated after auth by loadRealProfileIntoCurrentUser, refreshed from each
// progress reply) and sets the fastTrackActive flag BEFORE the challenge renders.
// Won't override flags that the student already earned mid-session.
// The automatic scaffold route (easier version below a confidence threshold)
// was removed with the Mastery Map write path: the student always meets the
// main problem, with Lens 4 support around it. The in-session side-quest offer
// on the second wrong attempt is unchanged until Phase 9.
function aceChooseRoute(idx) {
  if (scaffoldActive || fastTrackActive) return;

  const conceptKey = challengeConceptKey(idx);
  if (!conceptKey) return;

  const mastery = (window.currentUser && window.currentUser.mastery_state) || null;
  // mastery_state can arrive as either a parsed object (from the merge in
  // loadRealProfileIntoCurrentUser) or a JSON string (from a raw DB row).
  let state = mastery;
  if (typeof state === 'string') {
    try { state = JSON.parse(state); } catch { state = null; }
  }
  if (!state || typeof state !== 'object') return;

  const entry = state[conceptKey];
  if (!entry || typeof entry !== 'object') return;
  const confidence = (typeof entry.confidence === 'number') ? entry.confidence : null;
  if (confidence === null) return;

  // Fast-track requires a matching variant for this idx.
  if (confidence >= ACE_FASTTRACK_THRESHOLD && fastTrackVariants[idx]) {
    fastTrackActive = true;
    console.log('[ACE] Fast-track route chosen for idx', idx,
      'concept:', conceptKey, '| confidence:', confidence);
    return;
  }

  console.log('[ACE] Normal route for idx', idx,
    'concept:', conceptKey, '| confidence:', confidence);
}
```

- [ ] **Step 4: Point `computeAndPersistFadeLevel` at the challenge**

In `computeAndPersistFadeLevel(idx)`, replace the line

```js
  const conceptKey = CHALLENGE_CONCEPT_KEY[idx];
```

with

```js
  const conceptKey = challengeConceptKey(idx);
```

- [ ] **Step 5: Update the routing comment in `loadChallenge`**

Inside `loadChallenge(idx)`, replace the seven-line comment block (currently lines 4967-4973) that starts with `// ═══ ACE ROUTING DECISION ═══` and ends with `// still fire as fallbacks for mid-session struggles/wins.` (its fifth line contains an em-dash, so the old text is not reproduced here) with:

```js
  // ═══ ACE ROUTING DECISION ═══
  // Consult the student's mastery_state (populated from D1 via
  // loadRealProfileIntoCurrentUser and refreshed from each progress reply)
  // to decide whether to open the challenge in fast-track mode or the normal
  // variant. This is a PRE-CHALLENGE decision based on historical confidence.
  // The existing in-session triggers (attempts === 2 offers the side quest,
  // fast-solve offers fast-track) still fire for mid-session struggles/wins.
```

- [ ] **Step 6: Verify by grep and by parsing every inline script**

```bash
grep -c "CHALLENGE_CONCEPT_KEY" public/index.html      # expect 0
grep -c "ACE_SCAFFOLD_THRESHOLD" public/index.html     # expect 0
grep -c "challengeConceptKey(idx)" public/index.html   # expect 3 (the definition, the route chooser, the fade level)
grep -c '^    concept: "' public/index.html            # expect 4
```

Then extract and syntax-check every inline script (this catches a stray brace or a duplicate declaration that grep cannot):

```bash
TMP="${TMP:-$(mktemp -d)}"; OUT="$TMP/inline"; rm -rf "$OUT"; mkdir -p "$OUT"
node -e '
const fs=require("fs");const src=fs.readFileSync("public/index.html","utf8");
const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0;
while((m=re.exec(src))){i++;fs.writeFileSync(process.argv[1]+"/inline-"+i+".js",m[1]);}
console.log("inline scripts:",i);
' "$OUT"
for f in "$OUT"/inline-*.js; do node --check "$f" && echo "OK $(basename "$f")"; done
```

Expected: `inline scripts: 3` and three `OK` lines. Then `npm test`: 113 passing.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -F - <<'MSG'
feat(ace): carry the concept on each challenge and drop the scaffold route

Each entry in the challenges array now has a concept field; the route
chooser and the fade level computation read it through
challengeConceptKey(idx). The index-keyed map is retired. aceChooseRoute
no longer selects the easier version below a confidence threshold;
fast-track is unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: Send the concept with each attempt and refresh from the reply

**Files:**
- Modify: `public/index.html` (`saveAttemptToD1` near line 5472; `saveUnityAttemptToD1` near line 5505; two new helpers placed directly above `saveAttemptToD1`)

**Interfaces:**
- Consumes (Task 3): the POST reply `{ ok, profile }` with `profile.mastery_state` as a JSON string; the optional `concept_key` field. (Task 4): `challengeConceptKey(idx)`.
- Produces: `applyProgressReply(data)` and `logMasteryFromReply(data, conceptKey)` at top-level scope; `window.currentUser.mastery_state` is current after every save.

- [ ] **Step 1: Add the two helpers**

Directly above the line `async function saveAttemptToD1(ch, idx, isCorrect, val, tracker) {` insert:

```js
// Copy the refreshed mastery JSON from a /api/student/progress reply onto the
// in-page user, so the next loadChallenge sees it for routing and fade level
// without a second request or a reload.
function applyProgressReply(data) {
  if (!data || !data.profile || !window.currentUser) return;
  if (data.profile.mastery_state === undefined) return;
  window.currentUser.mastery_state = data.profile.mastery_state;
}

// Proof-of-life line, the Mastery Map counterpart of the Phase 5a fade line.
function logMasteryFromReply(data, conceptKey) {
  try {
    let state = (data && data.profile) ? data.profile.mastery_state : null;
    if (typeof state === 'string') state = JSON.parse(state);
    const entry = (state && conceptKey) ? state[conceptKey] : null;
    if (entry && typeof entry.confidence === 'number') {
      console.log('[ACE v3] mastery ' + conceptKey + ': ' + entry.confidence + ' (' + entry.level + ')');
    }
  } catch (e) {
    // display only; never let logging break the save path
  }
}
```

- [ ] **Step 2: Send `concept_key` and consume the reply in `saveAttemptToD1`**

Replace the body of the `try` block in `saveAttemptToD1` (currently lines 5481-5496, from `await API.post('/api/student/progress', {` through `});`) with:

```js
    // The concept comes from the main challenge at idx, not from ch: on the
    // side quest, ch is the scaffold challenge (no concept), and the attempt
    // must still count toward the main concept. It arrives with was_scaffold
    // true, so the server scores it as assisted.
    const conceptKey = challengeConceptKey(idx);
    const data = await API.post('/api/student/progress', {
      session_id: sessionId,
      challenge_id: challengeId,
      location,
      tier: ch.tier || 'foundation',
      user_answer: String(val),
      is_correct: isCorrect,
      attempt_number: tracker.attempts,
      hints_used: tracker.hintsUsed,
      time_spent_seconds: Math.round((Date.now() - tracker.timeStarted) / 1000),
      was_scaffold: scaffoldActive,
      was_fast_track: fastTrackActive,
      xp_awarded: isCorrect ? (ch.xp || 0) : 0,
      ...(conceptKey ? { concept_key: conceptKey } : {}),
    });
    applyProgressReply(data);
    logMasteryFromReply(data, conceptKey);
```

The `catch (e)` that follows stays as it is.

- [ ] **Step 3: Consume the reply in `saveUnityAttemptToD1`**

In `saveUnityAttemptToD1`, change the line

```js
    await API.post('/api/student/progress', {
```

to

```js
    const data = await API.post('/api/student/progress', {
```

and directly after the closing `});` of that call (before the `} catch (e) {` line) add:

```js
    applyProgressReply(data);
```

- [ ] **Step 4: Verify**

```bash
grep -c "concept_key: conceptKey" public/index.html   # expect 1
grep -c "applyProgressReply(data)" public/index.html  # expect 2
grep -c "logMasteryFromReply(data, conceptKey)" public/index.html  # expect 1
```

Re-run the inline script parse from Task 4 Step 6 (three `OK` lines), then `npm test` (113 passing).

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -F - <<'MSG'
feat(ace): send concept_key with each attempt and refresh mastery from the reply

saveAttemptToD1 carries the main challenge's concept key and both save
functions copy profile.mastery_state from the reply onto the in-page
user, so the next challenge load sees current mastery. Adds the
[ACE v3] mastery console line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: Local end to end against the local D1

**Files:**
- No source changes expected. Writes go to the local D1 under `.wrangler/` (git-ignored) and to the scratch directory. If a bug surfaces, fix it in the file that owns it, add a unit test for it in `tests/mastery-rule.test.js` when the rule is at fault, and commit the fix separately.

**Interfaces:**
- Consumes everything from Tasks 1 to 5.
- Produces a written record (in the task report) of each assertion below with the actual values observed.

- [ ] **Step 1: Prepare the local database**

```bash
npm run db:migrate:local 2>&1 | tail -3
npx wrangler d1 execute questsim-ace-triangle-types --local --command "INSERT OR IGNORE INTO users (id, email, first_name, last_name, role) VALUES (9001, 'e2e@example.com', 'E2E', 'Student', 'student'); INSERT OR REPLACE INTO sessions (id, user_id, expires_at) VALUES ('e2e-session', 9001, datetime('now', '+1 day')); DELETE FROM student_profiles WHERE user_id = 9001;" 2>&1 | tail -3
```

Expected: the schema applies and the two statements succeed.

- [ ] **Step 2: Start the local server in the background**

```bash
TMP="${TMP:-$(mktemp -d)}"
npx wrangler pages dev public/ --d1 DB=03d3d8e4-fd55-4913-bb0d-6f0bcd7e6199 --port 8788 > "$TMP/pages-dev.log" 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:8788/ && break; sleep 1; done
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8788/
```

Expected: `200`. (Use the Bash tool's background option rather than `&` if the tool requires it. Do not use the browser preview tool to start the server; this task drives it with curl.)

- [ ] **Step 3: Confirm the seeded session authenticates**

```bash
curl -s -H 'Cookie: qs_session=e2e-session' http://localhost:8788/api/auth/session
```

Expected: `{"authenticated":true,"user":{"id":9001,...}}`.

- [ ] **Step 4: Start a game session and keep its id**

```bash
SID=$(curl -s -X POST -H 'Cookie: qs_session=e2e-session' -H 'Content-Type: application/json' -d '{"action":"start"}' http://localhost:8788/api/student/session | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).session_id")
echo "session_id=$SID"
```

Expected: an integer.

- [ ] **Step 5: Story 1, clean correct on Athens**

```bash
curl -s -X POST -H 'Cookie: qs_session=e2e-session' -H 'Content-Type: application/json' \
  -d "{\"session_id\":$SID,\"challenge_id\":\"ch_athens_extension_waters2\",\"location\":\"athens\",\"tier\":\"Extension Waters\",\"user_answer\":\"12\",\"is_correct\":true,\"attempt_number\":1,\"hints_used\":0,\"time_spent_seconds\":41,\"was_scaffold\":false,\"was_fast_track\":false,\"xp_awarded\":15,\"concept_key\":\"finding_leg\"}" \
  http://localhost:8788/api/student/progress | node -p "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); JSON.stringify({ok:r.ok, xp:r.profile.xp, mastery:JSON.parse(r.profile.mastery_state)})"
```

Expected: `ok` true, `xp` 15, and `mastery.finding_leg` equal to `{ level: 'extension', confidence: 0.727, correct: 1, total: 1, assisted: 0, last_activity: 'ch_athens_extension_waters2', updated_at: <timestamp> }`.

- [ ] **Step 6: Story 4 on Rhodes, wrong then assisted right**

Send the same shape with `challenge_id` `ch_rhodes_extension_waters3`, `location` `rhodes`, `concept_key` `finding_hypotenuse`, first with `is_correct` false, `attempt_number` 1, `user_answer` `"23"`, `xp_awarded` 0; then with `is_correct` true, `attempt_number` 2, `user_answer` `"17"`, `xp_awarded` 20.

Expected after the first: `finding_hypotenuse.confidence` 0.241, level foundation, correct 0, total 1. After the second: 0.491, correct 1, total 2, assisted 1. And `finding_leg` is still present and unchanged.

- [ ] **Step 7: Invalid concept key writes nothing**

```bash
BEFORE=$(npx wrangler d1 execute questsim-ace-triangle-types --local --command "SELECT COUNT(*) AS n FROM challenge_attempts WHERE student_id = 9001;" --json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[0].results[0].n")
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Cookie: qs_session=e2e-session' -H 'Content-Type: application/json' \
  -d "{\"session_id\":$SID,\"challenge_id\":\"ch_athens_extension_waters2\",\"location\":\"athens\",\"tier\":\"Extension Waters\",\"user_answer\":\"12\",\"is_correct\":true,\"attempt_number\":1,\"hints_used\":0,\"was_scaffold\":false,\"was_fast_track\":false,\"xp_awarded\":15,\"concept_key\":\"Finding Leg\"}" \
  http://localhost:8788/api/student/progress
AFTER=$(npx wrangler d1 execute questsim-ace-triangle-types --local --command "SELECT COUNT(*) AS n FROM challenge_attempts WHERE student_id = 9001;" --json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[0].results[0].n")
echo "attempt rows before=$BEFORE after=$AFTER"
```

Expected: `400`, and `before` equals `after` (3 and 3).

- [ ] **Step 8: A Samos-style write merges instead of replacing**

```bash
curl -s -X POST -H 'Cookie: qs_session=e2e-session' -H 'Content-Type: application/json' \
  -d "{\"session_id\":$SID,\"challenge_id\":\"ch_samos_foundation_harbor1\",\"location\":\"samos\",\"tier\":\"Foundation Harbor\",\"user_answer\":\"{}\",\"is_correct\":true,\"attempt_number\":1,\"hints_used\":0,\"time_spent_seconds\":90,\"was_scaffold\":false,\"was_fast_track\":false,\"xp_awarded\":10,\"mastery_state\":{\"triangle_types\":{\"level\":\"mastery\",\"confidence\":1,\"correct\":4,\"total\":4,\"last_activity\":\"samos_types\",\"updated_at\":\"2026-09-16T18:00:00.000Z\"}}}" \
  http://localhost:8788/api/student/progress | node -p "Object.keys(JSON.parse(JSON.parse(require('fs').readFileSync(0,'utf8')).profile.mastery_state)).sort().join(',')"
```

Expected: `finding_hypotenuse,finding_leg,triangle_types`. Then send the same request again with `mastery_state` set to `{"right": 0.5}` and expect HTTP `400`.

- [ ] **Step 9: The profile endpoint returns the merged state**

```bash
curl -s -H 'Cookie: qs_session=e2e-session' http://localhost:8788/api/student/profile | node -p "JSON.parse(JSON.parse(require('fs').readFileSync(0,'utf8')).profile.mastery_state).finding_leg.confidence"
```

Expected: `0.727`.

- [ ] **Step 10: Browser leg (when the Browser pane tools are available to you)**

Open `http://localhost:8788/`, then in the page run `document.cookie = 'qs_session=e2e-session; path=/'` and reload. The app should treat you as the signed-in E2E Student (the guest button is not needed). Complete or skip the check-in, open the Quest map, click Athens, Continue, Accept the Challenge. In the console expect `[ACE v3] fade level for finding_leg : 0.727 (mode: delayed)` (`computeFadeLevel` returns the confidence itself, clamped to 0..1, and 0.727 sits in the delayed band). Enter `12` and Submit. Expect `[ACE v3] mastery finding_leg: 0.938 (mastery)` in the console. Return to the map and open Athens again: expect `fade level for finding_leg : 0.938 (mode: withdrawn)`. At 0.938 the route chooser may also open the fast-track variant of Athens (it is above 0.85 and a variant exists); that is expected and the fade line still prints.

If the tools are not available, state that plainly in the task report; Steps 5 to 9 are the required evidence and the browser leg is verified again after the merge by Linda's signed-in check.

- [ ] **Step 11: Stop the server and record**

Stop the background server (kill the wrangler process you started). Write every observed value from Steps 3 to 10 into the task report. No commit is expected from this task unless a fix was needed; if one was, its commit message names the bug and the step that found it.

---

## Self-review (run by the plan author before handoff)

**Spec coverage:**
- 4.1 to 4.6 (parameters, formulas, stories, functions, entry shape, clamp): Tasks 1 and 2.
- 5.1 to 5.5 (branches, validation before write, both-fields rejection, concurrency note, response and auth unchanged): Task 3.
- 6.1 to 6.6 (concept on challenge, payload, refresh, route chooser, console line, untouched areas): Tasks 4 and 5.
- 7 (dashboard unchanged): no task, by design; Task 6 Step 8 confirms the entry shape the roster reads.
- 8.1 to 8.4 and 8.6 (unit tests, endpoint logic as pure functions, build proof, local end to end, regression): Tasks 1, 2, 3 Step 5, 6, and the `npm test` step in every task.
- 8.5 (production check by Linda): outside the plan; handed over at merge.
- 9 and 10: nothing to implement.

**Placeholder scan:** no TBD, TODO, "handle edge cases", or "similar to Task N". Every code step shows the code.

**Type consistency:** `challengeConceptKey(idx)` is defined in Task 4 Step 2 and used in Task 4 Steps 3 and 4 and Task 5 Step 2. `applyProgressReply` and `logMasteryFromReply` are defined in Task 5 Step 1 and used in Steps 2 and 3. The module exports named in Task 3's import all exist in Tasks 1 and 2 (`applyAttempt`, `isAssisted`, `mergeMasteryPayload`, `validateConceptKey`, `validateMasteryPayload`, `MasteryState`). The test counts are cumulative: 19 after Task 1, 34 after Task 2 (15 added), 113 total with the existing 79.
