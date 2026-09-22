# ACE v3.0 Phase 3 Implementation Plan (F1/F2 Producers Firing Real Scaffolds)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first ACE v3 scaffolds that a student actually sees on-screen: fix the `submitAnswer` shim, extract the ScaffoldingFramework into a testable module, seed `challengeSupports` for the four Pythagoras challenges, implement F1 Simplify and F2 Strategic help producers, wire them into `consult()`, and render returned scaffolds in the feedback panel.

**Architecture:** F1 and F2 read from `Challenge.challengeSupports` (per-challenge pool of pre-authored supports) and select which to fire based on runtime state (attempt count, time on task, affect). Selected scaffolds flow through the six-function evaluation order (spec Section 4), then get composed into the feedback panel as cards under the existing narrative. Phase 3 uses simple selection heuristics; policy tuning waits for real user data. First unit tests land via Vitest.

**Tech Stack:** Vanilla JavaScript, Cloudflare Pages. Adds Vitest (with jsdom environment) for unit tests. Extracts `window.ScaffoldingFramework` from inline HTML into `public/js/scaffolding-framework.js` (loaded via `<script src>`).

**Spec:** [../specs/2026-08-30-ace-scaffolding-lens4-design.md](../specs/2026-08-30-ace-scaffolding-lens4-design.md)

**Prior phase:** [2026-08-31-ace-v3-phase-1-foundation.md](2026-08-31-ace-v3-phase-1-foundation.md) (merged in PR #5, commit `c7b78b3`)

## Global Constraints

- **No em-dashes anywhere** in code, comments, commit messages, README copy, test descriptions. Use commas, colons, periods, parentheses, or "to"/"and". Absolute per Linda's CLAUDE.md.
- **Banned AI-tell words in all copy** (comments, commit messages, test descriptions, drafted scaffold content): "honest", "honestly", "quiet", "quietly", "genuinely", "truly", "landed" (as arrival metaphor).
- **Banned AI-tell phrases**: "what is working", "worth [verb]-ing", reveal-list triptychs (X / not-X / next-step). Say things plainly.
- **Preserve v2 code untouched** through Task 6. `scaffoldActive`, `fastTrackActive`, `aceChooseRoute()`, `scaffoldChallenges`, `fastTrackVariants`, `enterScaffold()`, `handleFastTrackOffer()`, `.scaffold-panel` CSS, `{scaffoldHint}` template variables must remain identical. Phase 9 handles their retirement.
- **Preserve Phase 1+2 code shape.** The `ScaffoldingFramework` object's public API (`version`, `SupportKinds`, `Functions`, `createScaffold`, `consult`) stays the same. Task 2 extracts the file location; API is unchanged.
- **The shim fix (Task 1) is scoped to `submitAnswer` only.** The QS demo IIFE at `public/index.html:6438` does other things (rendering panels, stats). Do not touch anything unrelated.
- **Content drafting rule** (Task 3): use Pythagoras's voice, no em-dashes, no banned words. Keep supports short (Sentence Stem ≤ 20 words, Prompt ≤ 15 words, Hint ≤ 30 words). Match the existing narrative tone.
- **Commit granularity**: each task ends with one commit. Commit messages follow repo convention (`feat:` / `fix:` / `chore:` / `docs:` / `test:` prefix, lowercase, one sentence). No em-dashes.
- **Test framework choice locked**: Vitest with jsdom environment. Test files under `tests/`.

---

## File Structure

| File | Change | Purpose |
|---|---|---|
| `public/index.html` | Modify Task 1 (~5 lines) | Remove or delegate the `submitAnswer` shim so `handleIncorrectAnswer` reaches on live Submit |
| `public/index.html` | Modify Task 2 (~90 lines removed, 1 line added) | Remove inline `ScaffoldingFramework` block, add `<script src="js/scaffolding-framework.js">` |
| `public/js/scaffolding-framework.js` | Create Task 2 (~100 lines) | Extracted ScaffoldingFramework module. Assigns to `globalThis.ScaffoldingFramework`. |
| `public/index.html` | Modify Task 3 (~40 lines added) | Attach `challengeSupports` pool to each of four challenges |
| `public/js/scaffolding-framework.js` | Modify Task 4 (~60 lines) | Implement F1 Simplify producer body |
| `public/js/scaffolding-framework.js` | Modify Task 5 (~70 lines) | Implement F2 Strategic help producer body |
| `public/js/scaffolding-framework.js` | Modify Task 6 (~40 lines) | Update `consult()` to invoke F1 and F2 in order |
| `public/index.html` | Modify Task 7 (~50 lines) | Render returned scaffolds in the feedback panel; CSS for scaffold cards |
| `package.json` | Modify Task 2 (~4 lines) | Add vitest devDep and `test` script |
| `vitest.config.js` | Create Task 2 (~15 lines) | Vitest config with jsdom environment |
| `tests/scaffolding-framework.test.js` | Create Task 2 (~40 lines) | Smoke test verifying framework module loads and exports expected API |
| `tests/f1-simplify.test.js` | Create Task 4 (~80 lines) | Unit tests for F1 selection logic |
| `tests/f2-strategic-help.test.js` | Create Task 5 (~90 lines) | Unit tests for F2 selection logic |
| `tests/consult-orchestration.test.js` | Create Task 6 (~70 lines) | Integration tests for the F4→F2→F1→F5→intervention→F3→F6 order |
| `.gitignore` | Create if missing (~5 lines) | Ignore `node_modules/`, `.wrangler/`, `.claude/`, `coverage/` |

---

## Task 1: Fix the QS `submitAnswer` shim

**Files:**
- Modify: `public/index.html` around line 7079 (inside `document.addEventListener('DOMContentLoaded', ...)`)

**Interfaces:**
- Consumes: existing top-level `submitAnswer` function at `public/index.html:5450` (the real one that calls `handleIncorrectAnswer`) and the QS IIFE at `public/index.html:6438`
- Produces: `window.submitAnswer` bound to the top-level `submitAnswer` (not the QS closure's local version). All Phase 1+2 wiring (framework load log + consult call in `handleIncorrectAnswer`) becomes reachable via live Submit clicks.

- [ ] **Step 1.1: Locate the shim assignment**

Run: `grep -n "window.submitAnswer" public/index.html`
Expected: two matches. The pre-existing shim is inside the DOMContentLoaded block around line 7079 (`window.submitAnswer = submitAnswer;` where `submitAnswer` resolves to the QS IIFE's local closure).

- [ ] **Step 1.2: Understand the QS IIFE's `submitAnswer`**

Read `public/index.html:6738-6760` (approximately, adjust to actual location of the QS IIFE's `submitAnswer` function). Confirm it writes to the same DOM elements as the real `handleIncorrectAnswer` path but does not delegate to it. Note in the task report whether the QS version does anything unique (analytics, tracking) that would be lost by the fix.

- [ ] **Step 1.3: Change the shim**

Choose one of two fixes based on Step 1.2's finding:

**Fix A (retire override):** if QS's `submitAnswer` is purely a demo re-implementation with no unique side effects, remove the assignment:
```javascript
// Before (line 7079):
window.submitAnswer = submitAnswer;
// After:
// (line removed; window.submitAnswer stays bound to the top-level function)
```

**Fix B (delegate):** if QS's version has unique side effects worth preserving, wrap the real function:
```javascript
window.submitAnswer = function() {
  // Preserve top-level submitAnswer's behavior (includes ACE v3 wiring)
  submitAnswer();
};
```

Pick Fix A unless Step 1.2 documented specific side effects. Note the choice in the task report.

- [ ] **Step 1.4: Manual smoke test**

Run: `npm run dev`
Open the local Cloudflare Pages dev URL in a browser with DevTools open.

Sign in as a test user. Enter Challenge 1. Submit an incorrect answer.

Expected DevTools console output:
- `[ACE v3] ScaffoldingFramework loaded: v3.0-phase-1` (on page load, unchanged from Phase 1+2)
- `[ACE v3] consult() returned 0 scaffolds` (NEW: this must appear on the wrong-answer click; Phase 1+2's wiring is now reachable)

Also verify: feedback panel still renders correctly (v2 scaffold/fast-track paths still work if their conditions are met).

- [ ] **Step 1.5: Commit**

```bash
git add public/index.html
git commit -m "fix: retire QS submitAnswer shim so ACE v3 wiring reaches live clicks"
```

(Adjust the commit message verb if you used Fix B: `fix: delegate QS submitAnswer shim to top-level submitAnswer`.)

---

## Task 2: Extract ScaffoldingFramework and add Vitest

**Files:**
- Create: `public/js/scaffolding-framework.js`
- Modify: `public/index.html` (remove the inline framework block, add `<script src>` tag)
- Modify: `package.json` (add vitest, test script)
- Create: `vitest.config.js`
- Create: `tests/scaffolding-framework.test.js`
- Create if missing: `.gitignore`

**Interfaces:**
- Consumes: existing inline `ScaffoldingFramework` block at `public/index.html:~4553-4645` (from Phase 1+2)
- Produces: `globalThis.ScaffoldingFramework` populated identically to Phase 1+2's shape, but from an external `.js` file. Later tasks (4, 5, 6) modify this file, not `index.html`. Vitest is available via `npm test`.

- [ ] **Step 2.1: Create `.gitignore` if missing**

Run: `[ -f .gitignore ] && echo exists || echo missing`

If missing, create with:
```
node_modules/
.wrangler/
.claude/
coverage/
*.log
```

- [ ] **Step 2.2: Create the extracted module file**

Create `public/js/scaffolding-framework.js` with the ENTIRE contents of the current inline `ScaffoldingFramework` block from `public/index.html`, but change `window.ScaffoldingFramework = { ... }` to `globalThis.ScaffoldingFramework = { ... }` (works in both browser and Node/jsdom).

Locate the current block: `grep -n "ScaffoldingFramework loaded" public/index.html`. Copy from the `// ═══ ACE v3.0 SCAFFOLDING FRAMEWORK (LENS 4) ═══` comment banner through the `console.log(...)` line at the end.

The new file starts with:
```javascript
// ═══ ACE v3.0 SCAFFOLDING FRAMEWORK (LENS 4) ═══
// Extracted to its own module in Phase 3 for testability.
// Spec: docs/superpowers/specs/2026-08-30-ace-scaffolding-lens4-design.md
// Loaded by index.html via <script src="js/scaffolding-framework.js">.
// In Node/jsdom (Vitest), globalThis === global.
globalThis.ScaffoldingFramework = {
  // ... (copy the entire object from index.html)
};
console.log('[ACE v3] ScaffoldingFramework loaded:', globalThis.ScaffoldingFramework.version);
```

Include ALL Phase 1+2 properties: `version`, `SupportKinds`, `createScaffold`, `Functions` (with all six stubs), `consult`.

- [ ] **Step 2.3: Remove the inline block from `index.html`**

In `public/index.html`, delete the entire block from the `// ═══ ACE v3.0 SCAFFOLDING FRAMEWORK (LENS 4) ═══` banner through the `console.log(...)` line. Do NOT touch anything above the banner (Mastery Map) or below (`let currentTier` and ACE ROUTING).

- [ ] **Step 2.4: Add the script tag to `index.html`**

Find where other in-document `<script>` sections start (grep for `<script>` in `index.html`). Add BEFORE the first inline script:
```html
<script src="js/scaffolding-framework.js"></script>
```

Order matters: the framework must load before any inline script that uses `globalThis.ScaffoldingFramework` (namely the `consult` call in `handleIncorrectAnswer`, which runs later on user action, but the safe rule is: framework first).

- [ ] **Step 2.5: Add Vitest to `package.json`**

Add to `devDependencies`:
```json
"vitest": "^1.6.0",
"jsdom": "^24.0.0"
```

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Run: `npm install`
Expected: vitest and jsdom install without errors.

- [ ] **Step 2.6: Create `vitest.config.js`**

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js']
  }
});
```

- [ ] **Step 2.7: Create the smoke test**

`tests/scaffolding-framework.test.js`:
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ScaffoldingFramework module', () => {
  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
  });

  it('exposes globalThis.ScaffoldingFramework', () => {
    expect(globalThis.ScaffoldingFramework).toBeDefined();
  });

  it('has the Phase 1+2 API surface', () => {
    const f = globalThis.ScaffoldingFramework;
    expect(f.version).toBe('v3.0-phase-1');
    expect(typeof f.consult).toBe('function');
    expect(typeof f.createScaffold).toBe('function');
    expect(Object.keys(f.SupportKinds)).toHaveLength(6);
    expect(Object.keys(f.Functions)).toHaveLength(6);
  });

  it('consult returns empty array when no producers wired', () => {
    const result = globalThis.ScaffoldingFramework.consult({});
    expect(Array.isArray(result)).toBe(true);
  });

  it('createScaffold produces expected shape', () => {
    const s = globalThis.ScaffoldingFramework.createScaffold({
      supportKind: 'sentence-stem',
      functions: ['F2'],
      payload: { text: 'test' }
    });
    expect(s.supportKind).toBe('sentence-stem');
    expect(s.functions).toEqual(['F2']);
    expect(s.source).toBe('system');
    expect(s.fadeStateRef).toBeNull();
    expect(typeof s.producedAt).toBe('string');
  });
});
```

- [ ] **Step 2.8: Run tests to verify they pass**

Run: `npm test`
Expected: 4 tests pass in `tests/scaffolding-framework.test.js`.

- [ ] **Step 2.9: Manual smoke test, page still loads**

Run: `npm run dev`. Open the local URL. DevTools console should show `[ACE v3] ScaffoldingFramework loaded: v3.0-phase-1` (unchanged from Phase 1+2). Submit a wrong answer: `[ACE v3] consult() returned 0 scaffolds` should still fire (from Task 1's shim fix).

- [ ] **Step 2.10: Commit**

```bash
git add .gitignore public/js/scaffolding-framework.js public/index.html package.json package-lock.json vitest.config.js tests/scaffolding-framework.test.js
git commit -m "chore(ace): extract ScaffoldingFramework and add Vitest with smoke tests"
```

---

## Task 3: Seed `challengeSupports` for the four challenges

**Files:**
- Modify: `public/index.html`. Locate each of the four challenge definitions in the `challenges` array and add a `challengeSupports` property to each.

**Interfaces:**
- Consumes: existing challenge array in `public/index.html` (find with `grep -n "challenges = \[" public/index.html`)
- Produces: each of the 4 challenge objects gains a `challengeSupports` property, an array of pre-authored support objects. F1 and F2 (Tasks 4 and 5) read from this pool.

Support object shape (matches spec Section 3 and Task 3 factory):
```javascript
{
  supportKind: 'offload' | 'prompt' | 'sentence-stem' | 'hint' | 'worked-example-fragment' | 'problematizing-nudge',
  functions: ['F1'] | ['F2'] | etc.,   // which functions can fire this
  payload: { text: 'Pythagoras dialogue string here' }
}
```

- [ ] **Step 3.1: Locate the challenges array**

Run: `grep -n "^const challenges\|^let challenges\|^var challenges" public/index.html`
Read the found line and the surrounding block to understand the shape.

Then for each of the four challenges (Samos triangle types, Athens finding-leg, Rhodes finding-hypotenuse, Alexandria pythagorean-triples), identify its object literal and where to insert the `challengeSupports` property.

- [ ] **Step 3.2: Draft the supports for Challenge 0 (Samos, Triangle Types)**

Add to Challenge 0's object literal:
```javascript
challengeSupports: [
  {
    supportKind: 'sentence-stem',
    functions: ['F2'],
    payload: { text: '"This triangle looks like a ___ because its sides are ___."' }
  },
  {
    supportKind: 'prompt',
    functions: ['F2'],
    payload: { text: '"Before you decide, compare the three sides. Are any two the same length?"' }
  },
  {
    supportKind: 'hint',
    functions: ['F2'],
    payload: { text: '"Right triangles always have one 90-degree angle. Do you see one here?"' }
  }
]
```

- [ ] **Step 3.3: Draft the supports for Challenge 1 (Athens, Finding the Missing Leg)**

Add to Challenge 1's object literal:
```javascript
challengeSupports: [
  {
    supportKind: 'offload',
    functions: ['F1'],
    payload: { text: '"Let me handle the squaring for you. Focus on setting up the relationship first."' }
  },
  {
    supportKind: 'sentence-stem',
    functions: ['F2'],
    payload: { text: '"The missing leg squared equals ___ squared minus ___ squared."' }
  },
  {
    supportKind: 'prompt',
    functions: ['F2'],
    payload: { text: '"Which side is the hypotenuse? That is the longest one, opposite the right angle."' }
  },
  {
    supportKind: 'hint',
    functions: ['F2'],
    payload: { text: '"To find a leg, rearrange: leg squared equals hypotenuse squared minus other leg squared."' }
  }
]
```

- [ ] **Step 3.4: Draft the supports for Challenge 2 (Rhodes, Finding the Hypotenuse)**

Add to Challenge 2's object literal:
```javascript
challengeSupports: [
  {
    supportKind: 'offload',
    functions: ['F1'],
    payload: { text: '"I will square the two legs for you. Sum them, then you take the square root."' }
  },
  {
    supportKind: 'sentence-stem',
    functions: ['F2'],
    payload: { text: '"The hypotenuse squared equals ___ squared plus ___ squared."' }
  },
  {
    supportKind: 'prompt',
    functions: ['F2'],
    payload: { text: '"You are looking for the longest side. That side goes on the LEFT of the equation."' }
  }
]
```

- [ ] **Step 3.5: Draft the supports for Challenge 3 (Alexandria, Verifying a Triple)**

Add to Challenge 3's object literal:
```javascript
challengeSupports: [
  {
    supportKind: 'prompt',
    functions: ['F2'],
    payload: { text: '"To verify: does a squared plus b squared equal c squared? Try it with the given numbers."' }
  },
  {
    supportKind: 'sentence-stem',
    functions: ['F2'],
    payload: { text: '"If this is a Pythagorean triple, then ___ squared plus ___ squared should equal ___ squared."' }
  },
  {
    supportKind: 'hint',
    functions: ['F2'],
    payload: { text: '"The largest number in the set is always the hypotenuse. Square it and compare."' }
  }
]
```

- [ ] **Step 3.6: Manual smoke test**

Run: `npm run dev`. Open in browser. In DevTools console:

```javascript
challenges[0].challengeSupports.length
```
Expected: `3`

```javascript
challenges[1].challengeSupports.length
```
Expected: `4`

```javascript
challenges[1].challengeSupports[0].supportKind
```
Expected: `"offload"`

Play through a challenge and confirm behavior is unchanged (Phase 3 producers do not fire until Task 6).

- [ ] **Step 3.7: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): seed challengeSupports pools for four Pythagoras challenges"
```

---

## Task 4: Implement F1 Simplify producer

**Files:**
- Modify: `public/js/scaffolding-framework.js`. Replace `F1_simplify(context)` stub body with real selection logic.
- Create: `tests/f1-simplify.test.js`

**Interfaces:**
- Consumes: `context` object passed by `consult()` with fields `{ studentId, challengeIdx, phase, performanceEvent?, affect?, mastery?, challengeSupports? }`
- Produces: a Scaffold instance (built via `createScaffold`) with `supportKind: 'offload'` or `'worked-example-fragment'`, or `null`

Selection heuristic for Phase 3 (kept simple; tune with real user data later):
- Fire when: `context.challengeSupports` contains at least one support whose `functions` includes `'F1'`, AND the student pattern suggests arithmetic is the blocker (attempts >= 2 AND time on task is above threshold, e.g. > 45 seconds average per attempt)
- If multiple F1-tagged supports exist, prefer Offload over Worked-Example Fragment
- Do NOT fire if `context.performanceEvent` is missing (no attempt data means no signal)

- [ ] **Step 4.1: Write the failing tests**

Create `tests/f1-simplify.test.js`:
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F1 Simplify producer', () => {
  let F1, createScaffold, SupportKinds;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    F1 = globalThis.ScaffoldingFramework.Functions.F1_simplify;
    createScaffold = globalThis.ScaffoldingFramework.createScaffold;
    SupportKinds = globalThis.ScaffoldingFramework.SupportKinds;
  });

  const offloadSupport = {
    supportKind: 'offload',
    functions: ['F1'],
    payload: { text: 'I will square for you.' }
  };

  it('returns null when no context is given', () => {
    expect(F1(null)).toBeNull();
    expect(F1(undefined)).toBeNull();
  });

  it('returns null when no F1-tagged supports in pool', () => {
    const context = {
      challengeSupports: [{ supportKind: 'prompt', functions: ['F2'], payload: { text: 'nope' } }],
      performanceEvent: { correct: false, attempts: 3, timeMs: 90000 }
    };
    expect(F1(context)).toBeNull();
  });

  it('returns null when no performanceEvent (no signal)', () => {
    const context = { challengeSupports: [offloadSupport] };
    expect(F1(context)).toBeNull();
  });

  it('returns null on first attempt (too early for Simplify)', () => {
    const context = {
      challengeSupports: [offloadSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 90000 }
    };
    expect(F1(context)).toBeNull();
  });

  it('returns null when time on task is below threshold (arithmetic likely not the blocker)', () => {
    const context = {
      challengeSupports: [offloadSupport],
      performanceEvent: { correct: false, attempts: 3, timeMs: 15000 }
    };
    expect(F1(context)).toBeNull();
  });

  it('fires Offload when attempts >= 2 AND time above threshold AND F1-support available', () => {
    const context = {
      challengeSupports: [offloadSupport],
      performanceEvent: { correct: false, attempts: 2, timeMs: 90000 }
    };
    const scaffold = F1(context);
    expect(scaffold).not.toBeNull();
    expect(scaffold.supportKind).toBe('offload');
    expect(scaffold.functions).toContain('F1');
    expect(scaffold.payload.text).toBe('I will square for you.');
  });

  it('prefers Offload over Worked-Example Fragment when both are available', () => {
    const wef = {
      supportKind: 'worked-example-fragment',
      functions: ['F1'],
      payload: { text: 'wef' }
    };
    const context = {
      challengeSupports: [wef, offloadSupport],
      performanceEvent: { correct: false, attempts: 3, timeMs: 90000 }
    };
    const scaffold = F1(context);
    expect(scaffold.supportKind).toBe('offload');
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npm test tests/f1-simplify.test.js`
Expected: most tests fail (F1 currently returns `null` for all inputs from Phase 1+2 stub). The "returns null when..." tests may accidentally pass; that is fine. Focus on the failure of "fires Offload when..." and "prefers Offload...".

- [ ] **Step 4.3: Implement F1 selection logic**

In `public/js/scaffolding-framework.js`, replace the F1 stub:

```javascript
// F1 Simplify (producer). Returns Offload or Worked-Example Fragment or null.
// Selection heuristic Phase 3: fire when attempts >= 2 AND time on task is
// above threshold (arithmetic is the likely blocker), AND the pool has an
// F1-tagged support. Prefer Offload over Worked-Example Fragment.
F1_simplify(context) {
  if (!context || typeof context !== 'object') return null;
  const evt = context.performanceEvent;
  if (!evt || typeof evt.attempts !== 'number') return null;
  if (evt.attempts < 2) return null;
  const TIME_THRESHOLD_MS = 30000;
  if (typeof evt.timeMs === 'number' && evt.timeMs < TIME_THRESHOLD_MS) return null;

  const pool = Array.isArray(context.challengeSupports) ? context.challengeSupports : [];
  const candidates = pool.filter(s =>
    Array.isArray(s.functions) && s.functions.includes('F1')
  );
  if (candidates.length === 0) return null;

  // Prefer Offload over Worked-Example Fragment
  const offload = candidates.find(s => s.supportKind === 'offload');
  const chosen = offload || candidates[0];

  return globalThis.ScaffoldingFramework.createScaffold({
    supportKind: chosen.supportKind,
    functions: ['F1'],
    payload: chosen.payload,
    source: 'system'
  });
},
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npm test tests/f1-simplify.test.js`
Expected: all 7 tests pass.

- [ ] **Step 4.5: Run all tests to verify no regressions**

Run: `npm test`
Expected: all tests across all files pass (framework smoke tests still pass).

- [ ] **Step 4.6: Commit**

```bash
git add public/js/scaffolding-framework.js tests/f1-simplify.test.js
git commit -m "feat(ace): implement F1 Simplify producer with selection heuristic"
```

---

## Task 5: Implement F2 Strategic help producer

**Files:**
- Modify: `public/js/scaffolding-framework.js`. Replace `F2_strategicHelp(context)` stub body.
- Create: `tests/f2-strategic-help.test.js`

**Interfaces:**
- Consumes: same `context` shape as F1
- Produces: a Scaffold with `supportKind: 'prompt'`, `'hint'`, or `'sentence-stem'`, or `null`

Selection heuristic for Phase 3:
- Fire when: at least one F2-tagged support is in the pool, AND attempts >= 1 (strategic help is a lighter intervention that can fire on first attempt), AND performanceEvent exists
- Do NOT fire on first attempt if student is showing signs of high confidence (would rob productive struggle). For Phase 3, use a simple proxy: skip if `context.affect?.engagementReadiness === 'maximum'`
- Support Kind escalation across attempts within the same challenge:
  - Attempts 1: prefer Prompt (lightest)
  - Attempts 2: prefer Sentence Stem
  - Attempts 3+: prefer Hint (strongest)
- If preferred Support Kind is not in pool, fall back to whichever F2-tagged support is available

- [ ] **Step 5.1: Write the failing tests**

Create `tests/f2-strategic-help.test.js`:
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F2 Strategic help producer', () => {
  let F2;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    F2 = globalThis.ScaffoldingFramework.Functions.F2_strategicHelp;
  });

  const promptSupport = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'prompt-text' } };
  const stemSupport = { supportKind: 'sentence-stem', functions: ['F2'], payload: { text: 'stem-text' } };
  const hintSupport = { supportKind: 'hint', functions: ['F2'], payload: { text: 'hint-text' } };
  const fullPool = [promptSupport, stemSupport, hintSupport];

  it('returns null when no context', () => {
    expect(F2(null)).toBeNull();
  });

  it('returns null when no F2-tagged supports', () => {
    const context = {
      challengeSupports: [{ supportKind: 'offload', functions: ['F1'], payload: {} }],
      performanceEvent: { correct: false, attempts: 1 }
    };
    expect(F2(context)).toBeNull();
  });

  it('returns null when no performanceEvent', () => {
    expect(F2({ challengeSupports: fullPool })).toBeNull();
  });

  it('skips first attempt for high-readiness students (protects productive struggle)', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 1 },
      affect: { engagementReadiness: 'maximum' }
    };
    expect(F2(context)).toBeNull();
  });

  it('fires Prompt on attempt 1 for normal-readiness student', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 1 }
    };
    const s = F2(context);
    expect(s).not.toBeNull();
    expect(s.supportKind).toBe('prompt');
  });

  it('fires Sentence Stem on attempt 2', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 2 }
    };
    const s = F2(context);
    expect(s.supportKind).toBe('sentence-stem');
  });

  it('fires Hint on attempt 3', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 3 }
    };
    const s = F2(context);
    expect(s.supportKind).toBe('hint');
  });

  it('falls back when preferred Support Kind not in pool', () => {
    // Attempt 2 prefers Sentence Stem; if only Prompt is available, fall back to Prompt
    const context = {
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 2 }
    };
    const s = F2(context);
    expect(s.supportKind).toBe('prompt');
  });

  it('output Scaffold has functions: [F2]', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 1 }
    };
    const s = F2(context);
    expect(s.functions).toEqual(['F2']);
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npm test tests/f2-strategic-help.test.js`
Expected: several tests fail (F2 still returns null stub).

- [ ] **Step 5.3: Implement F2 selection logic**

In `public/js/scaffolding-framework.js`, replace the F2 stub:

```javascript
// F2 Strategic help (producer). Returns Prompt, Hint, or Sentence Stem or null.
// Selection heuristic Phase 3:
//   - Fire when F2-tagged support is in pool AND performanceEvent exists
//   - Skip first attempt if student affect signals high readiness (protect productive struggle)
//   - Escalate Support Kind by attempt: 1 to Prompt, 2 to Sentence Stem, 3+ to Hint
//   - Fall back to any F2-tagged support if the preferred kind is not in the pool
F2_strategicHelp(context) {
  if (!context || typeof context !== 'object') return null;
  const evt = context.performanceEvent;
  if (!evt || typeof evt.attempts !== 'number') return null;

  const readiness = context.affect && context.affect.engagementReadiness;
  if (evt.attempts === 1 && readiness === 'maximum') return null;

  const pool = Array.isArray(context.challengeSupports) ? context.challengeSupports : [];
  const candidates = pool.filter(s =>
    Array.isArray(s.functions) && s.functions.includes('F2')
  );
  if (candidates.length === 0) return null;

  let preferred;
  if (evt.attempts === 1) preferred = 'prompt';
  else if (evt.attempts === 2) preferred = 'sentence-stem';
  else preferred = 'hint';

  const match = candidates.find(s => s.supportKind === preferred);
  const chosen = match || candidates[0];

  return globalThis.ScaffoldingFramework.createScaffold({
    supportKind: chosen.supportKind,
    functions: ['F2'],
    payload: chosen.payload,
    source: 'system'
  });
},
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npm test tests/f2-strategic-help.test.js`
Expected: all 9 tests pass.

- [ ] **Step 5.5: Run all tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add public/js/scaffolding-framework.js tests/f2-strategic-help.test.js
git commit -m "feat(ace): implement F2 Strategic help producer with escalation ladder"
```

---

## Task 6: Wire F1 and F2 into `consult()` orchestration

**Files:**
- Modify: `public/js/scaffolding-framework.js`. Replace `consult()` body to invoke F1 and F2 per spec Section 4 order.
- Create: `tests/consult-orchestration.test.js`

**Interfaces:**
- Consumes: `context` object plus the F1/F2 producer functions (implemented in Tasks 4 and 5)
- Produces: `consult()` now returns an array of 0, 1, or 2 Scaffolds depending on which producers fire

Per spec Section 4, the full evaluation order is F4 → F2 → F1 → F5 → Intervention Policy → F3 → F6. Phase 3 implements only F1 and F2. Later phases add F4/F5/F3/F6/Intervention. Phase 3 orchestration is:
1. Run F2 (strategic help)
2. Run F1 (simplify)
3. Return the surviving Scaffolds

F3 (tone modulation) and F6 (guardrail) are still stubs from Phase 1+2, so Phase 3 does NOT run them yet (they would no-op anyway). Intervention Policy is Phase 7. This ordering is provisional and will be updated in later phases.

- [ ] **Step 6.1: Write the failing tests**

Create `tests/consult-orchestration.test.js`:
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('consult orchestration', () => {
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

  const promptSupport = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'p' } };
  const offloadSupport = { supportKind: 'offload', functions: ['F1'], payload: { text: 'o' } };

  it('returns [] when context is empty', () => {
    expect(consult({})).toEqual([]);
  });

  it('returns [] when no producers fire', () => {
    // No pool, no event: neither F1 nor F2 fires
    expect(consult({ performanceEvent: { correct: false, attempts: 1 } })).toEqual([]);
  });

  it('returns [F2 scaffold] when only F2 fires (attempt 1, prompt in pool)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1 }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].supportKind).toBe('prompt');
    expect(scaffolds[0].functions).toEqual(['F2']);
  });

  it('returns [F2, F1] when both fire (attempt 3, time > threshold, both pools present)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport, offloadSupport],
      performanceEvent: { correct: false, attempts: 3, timeMs: 90000 }
    });
    expect(scaffolds).toHaveLength(2);
    // F2 evaluated first per spec Section 4 (strategic help before simplify)
    expect(scaffolds[0].functions).toEqual(['F2']);
    expect(scaffolds[1].functions).toEqual(['F1']);
  });

  it('handles a null return from a producer (does not crash)', () => {
    // Only F1-eligible pool + high-readiness first attempt: neither fires
    const scaffolds = consult({
      challengeSupports: [offloadSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 10000 },
      affect: { engagementReadiness: 'maximum' }
    });
    expect(scaffolds).toEqual([]);
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `npm test tests/consult-orchestration.test.js`
Expected: several tests fail (`consult` still returns `[]` from Phase 1+2 stub).

- [ ] **Step 6.3: Update `consult()` to invoke F1 and F2**

In `public/js/scaffolding-framework.js`, replace the `consult` method body:

```javascript
consult(context) {
  if (!context || typeof context !== 'object') return [];
  const scaffolds = [];
  const fns = globalThis.ScaffoldingFramework.Functions;

  // Phase 3 evaluation order (subset of spec Section 4):
  // F2 Strategic help, then F1 Simplify. F4, F5, F3, F6, and Intervention
  // Policy are wired in later phases and skipped here.
  const f2Result = fns.F2_strategicHelp(context);
  if (f2Result) scaffolds.push(f2Result);

  const f1Result = fns.F1_simplify(context);
  if (f1Result) scaffolds.push(f1Result);

  return scaffolds;
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `npm test tests/consult-orchestration.test.js`
Expected: all 5 orchestration tests pass.

- [ ] **Step 6.5: Run all tests**

Run: `npm test`
Expected: all tests across all files pass.

- [ ] **Step 6.6: Manual smoke test in browser**

Run: `npm run dev`. Sign in, enter Challenge 1 (Athens, finding-leg), submit a wrong answer.

Expected DevTools console:
- On page load: `[ACE v3] ScaffoldingFramework loaded: v3.0-phase-1`
- On wrong answer: `[ACE v3] consult() returned 1 scaffolds` (F2 fires on attempt 1 with Prompt)

Submit a second wrong answer:
- `[ACE v3] consult() returned 1 scaffolds` (F2 fires with Sentence Stem)

Submit a third wrong answer (wait ~45 seconds first to trigger F1):
- `[ACE v3] consult() returned 2 scaffolds` (F2 Hint + F1 Offload)

No UI change yet (Task 7 adds rendering). Feedback panel still renders v2 content only.

- [ ] **Step 6.7: Commit**

```bash
git add public/js/scaffolding-framework.js tests/consult-orchestration.test.js
git commit -m "feat(ace): wire F1 and F2 producers into consult orchestration"
```

---

## Task 7: Render scaffolds in the feedback panel

**Files:**
- Modify: `public/index.html`. Locate `handleIncorrectAnswer` (~line 5450), consume the `consult()` return value, and render each Scaffold in the feedback panel. Add CSS for the scaffold card layout.

**Interfaces:**
- Consumes: `consult()` return value (already computed at start of `handleIncorrectAnswer` from Phase 1+2)
- Produces: DOM changes in the feedback panel: below the existing narrative, a new "Support from Pythagoras" section renders one card per Scaffold

Layout:
- Section header: "Support from Pythagoras" (only shown if scaffolds returned)
- Each Scaffold rendered as a card:
  - Support Kind label pill (small, colored per kind)
  - Payload text (Pythagoras dialogue formatting matching the game's voice)
- Cards stack vertically, gap between them
- CSS uses existing tokens (var(--navy), var(--teal), var(--font-body)) with no hardcoded colors

- [ ] **Step 7.1: Locate `handleIncorrectAnswer` and the current consult wiring**

Run: `grep -n "handleIncorrectAnswer\|consult() returned" public/index.html`

Identify:
- The function signature line
- The existing `v3Scaffolds` local variable (from Phase 1+2's Task 5 wiring)
- Where the feedback panel HTML is built (likely a `feedbackHTML +=` pattern)

- [ ] **Step 7.2: Add CSS for scaffold cards**

Locate the existing CSS block (in `<style>` tags near the top of `index.html`). Add:

```css
.v3-scaffolds {
  margin-top: 20px;
  padding: 16px;
  background: rgba(42, 127, 142, 0.06);
  border-radius: var(--radius);
  border: 1px solid rgba(42, 127, 142, 0.15);
}
.v3-scaffolds-header {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--navy);
  margin-bottom: 12px;
}
.v3-scaffold-card {
  padding: 12px 14px;
  background: white;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  border-left: 3px solid var(--teal);
}
.v3-scaffold-card:last-child {
  margin-bottom: 0;
}
.v3-scaffold-kind {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--teal);
  margin-bottom: 6px;
}
.v3-scaffold-payload {
  font-size: 0.9rem;
  color: var(--text);
  line-height: 1.5;
  font-style: italic;
}
```

- [ ] **Step 7.3: Render scaffolds after the existing feedback narrative**

Find the location in `handleIncorrectAnswer` where `feedbackHTML` is being built (grep for `feedbackHTML +=`). After all existing v2 feedback pieces have been appended, add:

```javascript
// Append v3 scaffolds (from consult() at Step 4 of Feedback Loop).
if (Array.isArray(v3Scaffolds) && v3Scaffolds.length > 0) {
  let scaffoldsHTML = '<div class="v3-scaffolds">';
  scaffoldsHTML += '<div class="v3-scaffolds-header">Support from Pythagoras</div>';
  for (const scaffold of v3Scaffolds) {
    const kindLabel = scaffold.supportKind
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const payloadText = (scaffold.payload && scaffold.payload.text) || '';
    scaffoldsHTML += '<div class="v3-scaffold-card">';
    scaffoldsHTML += '<span class="v3-scaffold-kind">' + kindLabel + '</span>';
    scaffoldsHTML += '<div class="v3-scaffold-payload">' + payloadText + '</div>';
    scaffoldsHTML += '</div>';
  }
  scaffoldsHTML += '</div>';
  feedbackHTML += scaffoldsHTML;
}
```

If the variable name for the accumulated HTML is different (not `feedbackHTML`), adapt to the actual name.

- [ ] **Step 7.4: Manual smoke test in browser**

Run: `npm run dev`. Sign in, enter Challenge 1 (Athens), submit a wrong answer.

Expected in the browser:
- The usual feedback narrative appears (as before)
- BELOW the narrative, a new "Support from Pythagoras" section
- Inside: one card with a "Prompt" label pill and italic Pythagoras dialogue text ("Which side is the hypotenuse?...")

Submit two more wrong answers on the same challenge (wait 30+ seconds between the last two):
- Attempt 2: card with "Sentence Stem" label
- Attempt 3: two cards, "Hint" and "Offload"

Also verify: the existing v2 scaffold-path button ("Practice with easier numbers first") still appears when its condition fires. Both v2 and v3 UI coexist.

- [ ] **Step 7.5: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): render v3 scaffolds in feedback panel as Support cards"
```

---

## Task 8: End-to-end verification and push

**Files:** no file changes

**Interfaces:** consumes all prior task commits; produces origin branch update ready for PR

- [ ] **Step 8.1: Full test suite**

Run: `npm test`
Expected: all tests pass (framework smoke + F1 + F2 + orchestration).

- [ ] **Step 8.2: End-to-end browser walkthrough**

Run: `npm run dev`. Play through all four challenges. For each challenge:

- Submit correct answer first: verify no scaffolds fire (only v2 correct-feedback appears)
- Submit wrong answer first: verify F2 fires (a Prompt or similar Support Kind card renders)
- Submit multiple wrong answers: verify F2 escalates (Prompt → Sentence Stem → Hint)
- Where the pool has Offload: verify F1 fires on later attempts after time threshold

Verify existing v2 mechanics still work:
- Scaffold-path button ("Practice with easier numbers first") still appears when its condition triggers
- Fast-track still triggers when confidence is high
- Correct-answer narrative renders identically

- [ ] **Step 8.3: Verify branch state**

Run:
```bash
git status
git log --oneline origin/claude/kind-solomon-9be8a0..HEAD 2>/dev/null || git log --oneline -10
```
Expected: 7 new commits on top of the last pushed (7bb2282). Working tree clean.

- [ ] **Step 8.4: Push**

```bash
git push
```
Expected: push succeeds. Cloudflare Pages preview build starts.

- [ ] **Step 8.5: PR opening (optional; ask Linda first)**

Do NOT open a PR unless Linda has approved. If she has:

```bash
gh pr create \
  --base claude/integrate-triangle-types-activity-v0P98 \
  --head claude/kind-solomon-9be8a0 \
  --title "feat(ace): v3.0 Phase 3 F1/F2 producers firing real scaffolds" \
  --body "$(cat <<'EOF'
## Summary
Ships the first ACE v3 scaffolds a student sees on-screen. F1 Simplify and F2 Strategic help producers now select from per-challenge `challengeSupports` pools and render as cards in the feedback panel. Includes the QS shim fix, Vitest test framework, and extracted ScaffoldingFramework module.

## What ships
- QS `submitAnswer` shim retired so ACE v3 wiring reaches live Submit clicks
- `ScaffoldingFramework` extracted from inline HTML to `public/js/scaffolding-framework.js`
- Vitest with jsdom, 4 test files, unit + orchestration coverage
- `challengeSupports` pools seeded on all four challenges
- F1 Simplify producer (Offload / Worked-Example Fragment selection)
- F2 Strategic help producer (Prompt / Sentence Stem / Hint escalation)
- Feedback panel renders v3 scaffolds as Support cards below the narrative

## Test plan
- [x] `npm test` passes (all unit + orchestration tests)
- [ ] Cloudflare Pages preview build succeeds
- [ ] Wrong answer on Challenge 1 shows a Prompt card
- [ ] Third wrong attempt shows Hint + Offload cards
- [ ] v2 scaffold-path button still appears when its condition fires

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for the executor

- **If a test framework install fails**, check that Node.js version supports Vitest 1.x (Node 18+ required). Report the Node version and stop; do not attempt to downgrade Vitest.
- **If the smoke test in Task 1 shows the console log did NOT fire on a wrong answer**, the shim was not fully retired. Re-inspect `public/index.html:7079` and any other `window.submitAnswer` assignments. Report all findings.
- **Do not touch v2 code beyond what each task explicitly allows.** Do not "clean up" the QS IIFE beyond the `submitAnswer` shim (Task 1). Do not rename `scaffoldActive` or related v2 identifiers (Phase 9 job).
- **Selection heuristics in F1 and F2 are Phase 3 placeholders.** Do not add "smarter" logic (mastery-weighted selection, affect-driven priorities, etc.). Later phases with real user data will tune these.
- **Content in Task 3 is drafted for testability, not final pedagogy.** Linda reviews the writing at PR time. Do not add supports beyond what the plan specifies.
- **The rendering in Task 7 uses vanilla string concatenation for HTML (matching the codebase's existing pattern).** Do not introduce a template library or component framework.
