# ACE v3.0 Phase 4 Implementation Plan (F3 Tone Modulation, F6 Guardrail, Check-In Wiring)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the "same event, different stories" pedagogy: capture pre-game check-in answers as affect state, wire that state into `consult()`, and implement F3 Offset frustration (tone modulation) and F6 Learning-by-doing (runtime guardrail). Ships as first user-visible affective adaptation: an anxious student sees warmer scaffold framing than a confident one.

**Architecture:** Fix the Potemkin check-in screen by capturing emoji + choice selections into `window.aceCheckinState`. Thread that state into `handleIncorrectAnswer`'s consult context as `context.affect`. Replace F3 stub with tone-prepend logic driven by mathConfidence and engagementReadiness. Replace F6 stub with a defensive guardrail that rejects malformed scaffolds and detects answer-giveaway patterns. Update `consult()` to run F3 as a modifier after producers, then F6 as final filter.

**Tech Stack:** Vanilla JavaScript, Vitest with jsdom (from Phase 3), no new dependencies.

**Spec:** [../specs/2026-08-30-ace-scaffolding-lens4-design.md](../specs/2026-08-30-ace-scaffolding-lens4-design.md)

**Prior phase:** [2026-09-01-ace-v3-phase-3-producers.md](2026-09-01-ace-v3-phase-3-producers.md) (merged as `b14b9c5` on `claude/integrate-triangle-types-activity-v0P98`)

## Global Constraints

- **No em-dashes anywhere** in code, comments, commit messages, test descriptions, UI copy, drafted tone prefixes. Absolute per Linda's CLAUDE.md.
- **Banned AI-tell words in all copy** (comments, commit messages, tests, tone prefixes): "honest", "honestly", "quiet", "quietly", "genuinely", "truly", "landed" (as arrival metaphor).
- **Banned AI-tell phrases**: "what is working", "worth [verb]-ing", reveal-list triptychs.
- **Preserve v2 code untouched**: `scaffoldActive`, `fastTrackActive`, `aceChooseRoute()`, `scaffoldChallenges`, `fastTrackVariants`, `enterScaffold()`, `handleFastTrackOffer()`, `.scaffold-panel` CSS, `{scaffoldHint}` templates.
- **Preserve Phase 1+2/3 API surface**: `window.ScaffoldingFramework` shape unchanged. F3 keeps `(scaffold, affect)` signature, F6 keeps `(scaffold)` signature. Both now have real bodies.
- **Preserve F1, F2, createScaffold, SupportKinds from prior phases.** Only F3, F6, and consult() change in the framework file.
- **Do not persist check-in answers to D1 in this phase.** In-memory only. D1 write is a later phase (part of Progressive Authoring or a dedicated telemetry phase).
- **Tone prepends are short.** F3 modulation adds one prepended sentence, not a rewrite. Keep it under 20 words.
- **Commit granularity**: each task ends with one commit. Prefix per repo convention (`feat:` / `fix:` / `chore:` / `docs:` / `test:`). No em-dashes in commit messages.

---

## File Structure

| File | Change | Purpose |
|---|---|---|
| `public/index.html` | Modify Task 1 (~40 lines) | Replace `selectEmoji`/`selectChoice` stubs with capture logic; add `window.aceCheckinState` global; wire Begin Quest button to capture Q4 free text |
| `public/index.html` | Modify Task 2 (~5 lines) | Extend consult context in `handleIncorrectAnswer` to include `affect: window.aceCheckinState` |
| `public/js/scaffolding-framework.js` | Modify Task 3 (~30 lines) | Replace F3 stub with tone-modulation logic |
| `public/js/scaffolding-framework.js` | Modify Task 4 (~40 lines) | Replace F6 stub with guardrail logic |
| `public/js/scaffolding-framework.js` | Modify Task 5 (~15 lines) | Update `consult()` to run F3 after producers, then F6 as final filter |
| `tests/f3-offset-frustration.test.js` | Create Task 3 (~90 lines) | Unit tests for F3 tone modulation |
| `tests/f6-learning-by-doing.test.js` | Create Task 4 (~85 lines) | Unit tests for F6 guardrail |
| `tests/consult-orchestration.test.js` | Extend Task 5 (~40 lines added) | Integration tests for F3/F6 in the consult pipeline |

---

## Task 1: Capture check-in answers into state

**Files:**
- Modify: `public/index.html`. Touches `selectEmoji`, `selectChoice`, and the "Begin Quest" button flow (all near line 5930).

**Interfaces:**
- Consumes: existing check-in DOM (screen-checkin at line 1021, with checkin-q1 through checkin-q4)
- Produces: `window.aceCheckinState` global initialized on page load and populated as user answers check-in. Shape:
  ```javascript
  window.aceCheckinState = {
    mathConfidence: null | 1 | 2 | 3 | 4 | 5,    // storm=1, rain=2, cloud=3, partly-sunny=4, sunny=5
    selfAssessedUnderstanding: null | 'confused' | 'partial' | 'confident',
    engagementReadiness: null | 'calm' | 'challenge' | 'maximum',
    openExpression: null | string,                 // Q4 free text, may be empty string
    completedAt: null | string                     // ISO timestamp when Q4 or skip fires
  };
  ```
- Task 2 reads this global.

- [ ] **Step 1.1: Locate insertion points**

Run:
```
grep -n "function selectEmoji\|function selectChoice\|screen-checkin\|Begin Quest" public/index.html
```
Confirm: `selectEmoji` around line 5930, `selectChoice` around line 5939, "Begin Quest" button around line 1084, "Jump straight to the quest" skip link around line 1090.

- [ ] **Step 1.2: Add the global state declaration**

Near the top of the first `<script>` block (find with `grep -n "^<script>" public/index.html | head -3`), or near where other window-level state initialization happens, add:

```javascript
// ═══ ACE v3.0 CHECK-IN STATE ═══
// Populated by selectEmoji/selectChoice as the student advances through
// the pre-game check-in. Consumed by handleIncorrectAnswer's consult call
// as context.affect for F3 tone modulation. In-memory only in Phase 4;
// D1 persistence is deferred to a later phase.
window.aceCheckinState = {
  mathConfidence: null,
  selfAssessedUnderstanding: null,
  engagementReadiness: null,
  openExpression: null,
  completedAt: null
};
```

- [ ] **Step 1.3: Update `selectEmoji` to capture the answer**

Replace the existing `selectEmoji` function body with:

```javascript
function selectEmoji(el, nextQ) {
  el.parentElement.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  // Capture: 5-emoji scale, left to right = 1..5 (storm..sunny)
  const options = Array.from(el.parentElement.querySelectorAll('.emoji-option'));
  const idx = options.indexOf(el);
  if (idx >= 0) {
    window.aceCheckinState.mathConfidence = idx + 1;
    console.log('[ACE v3] check-in Q1 mathConfidence:', idx + 1);
  }
  setTimeout(() => {
    el.closest('[id^="checkin-"]').style.display = 'none';
    document.getElementById('checkin-' + nextQ).style.display = 'block';
  }, 500);
}
```

- [ ] **Step 1.4: Update `selectChoice` to capture the answer**

Replace `selectChoice` with:

```javascript
function selectChoice(el, nextQ) {
  el.parentElement.querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  // Capture: which question we are on (q2 = understanding, q3 = readiness) and which index
  const options = Array.from(el.parentElement.querySelectorAll('.choice-card'));
  const idx = options.indexOf(el);
  const currentQ = el.closest('[id^="checkin-"]').id;  // 'checkin-q2' | 'checkin-q3'
  if (currentQ === 'checkin-q2' && idx >= 0) {
    const map = ['confused', 'partial', 'confident'];
    window.aceCheckinState.selfAssessedUnderstanding = map[idx] || null;
    console.log('[ACE v3] check-in Q2 selfAssessedUnderstanding:', map[idx]);
  } else if (currentQ === 'checkin-q3' && idx >= 0) {
    const map = ['calm', 'challenge', 'maximum'];
    window.aceCheckinState.engagementReadiness = map[idx] || null;
    console.log('[ACE v3] check-in Q3 engagementReadiness:', map[idx]);
  }
  setTimeout(() => {
    el.closest('[id^="checkin-"]').style.display = 'none';
    document.getElementById('checkin-' + nextQ).style.display = 'block';
  }, 500);
}
```

- [ ] **Step 1.5: Capture Q4 free text on "Begin Quest"**

Find the "Begin Quest" button in the check-in Q4 block (around line 1084). It currently has `onclick="navigate('screen-simulation')"`. Change to a wrapper that captures the input first:

Replace:
```html
<button class="btn btn-primary btn-lg" onclick="navigate('screen-simulation')" style="margin-top:16px;">
  ⚔️ Begin Quest
</button>
```

With:
```html
<button class="btn btn-primary btn-lg" onclick="finishCheckin()" style="margin-top:16px;">
  ⚔️ Begin Quest
</button>
```

Then add a `finishCheckin()` function near `selectEmoji`/`selectChoice`:

```javascript
function finishCheckin() {
  const input = document.querySelector('#checkin-q4 input[type="text"]');
  if (input && input.value) {
    window.aceCheckinState.openExpression = input.value.trim();
  }
  window.aceCheckinState.completedAt = new Date().toISOString();
  console.log('[ACE v3] check-in complete:', window.aceCheckinState);
  navigate('screen-simulation');
}
```

- [ ] **Step 1.6: Handle the "Jump straight to the quest" skip path**

The skip link at line 1090 currently jumps directly. It leaves check-in state as all-nulls. That is fine (F3 handles null affect as a no-op, verified in Task 3). No change needed to the skip path.

Add a `completedAt` timestamp on skip too so we can distinguish "skipped" from "not shown yet":

Find the skip link:
```html
<span style="font-size:0.78rem;color:var(--text-muted);cursor:pointer;" onclick="navigate('screen-simulation')">Jump straight to the quest →</span>
```

Change to:
```html
<span style="font-size:0.78rem;color:var(--text-muted);cursor:pointer;" onclick="skipCheckin()">Jump straight to the quest →</span>
```

Add:
```javascript
function skipCheckin() {
  window.aceCheckinState.completedAt = new Date().toISOString();
  console.log('[ACE v3] check-in skipped:', window.aceCheckinState);
  navigate('screen-simulation');
}
```

Note the em-dash in the existing link text ("Jump straight to the quest →" contains a right arrow, not an em-dash; leave it alone). If you notice any real em-dashes in copy you are modifying, fix them.

- [ ] **Step 1.7: Manual smoke test**

Run `npm run dev`. Open the app.

Path A (full check-in):
- Sign in, land on check-in screen
- Click a "storm cloud" (leftmost emoji). DevTools console: `[ACE v3] check-in Q1 mathConfidence: 1`
- Click "Still confused". Console: `[ACE v3] check-in Q2 selfAssessedUnderstanding: confused`
- Click "Calm & steady". Console: `[ACE v3] check-in Q3 engagementReadiness: calm`
- Type something in the input, click "Begin Quest". Console: `[ACE v3] check-in complete: { mathConfidence: 1, selfAssessedUnderstanding: 'confused', engagementReadiness: 'calm', openExpression: '<your text>', completedAt: '<iso>' }`

Path B (skip):
- Fresh page load. Click "Jump straight to the quest". Console: `[ACE v3] check-in skipped: { mathConfidence: null, ..., completedAt: '<iso>' }`

Verify: no JavaScript errors. Existing screen navigation still works.

- [ ] **Step 1.8: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): capture check-in answers into window.aceCheckinState"
```

---

## Task 2: Thread affect into consult context

**Files:**
- Modify: `public/index.html`. Touches `handleIncorrectAnswer` around line 5554.

**Interfaces:**
- Consumes: `window.aceCheckinState` (from Task 1)
- Produces: `context.affect` in the consult call, with the shape defined in Task 1

- [ ] **Step 2.1: Locate the consult call**

Run: `grep -n "ScaffoldingFramework.consult" public/index.html`
Confirm: the consult call is inside `handleIncorrectAnswer`, around line 5554. It currently passes `{ studentId, challengeIdx, phase, performanceEvent, challengeSupports }` (from Phase 3 Task 7).

- [ ] **Step 2.2: Add affect to the context object**

Extend the context passed to `consult()` with a new `affect` field:

```javascript
const v3Scaffolds = window.ScaffoldingFramework.consult({
  studentId:  (window.currentUser && window.currentUser.id) || null,
  challengeIdx: idx,
  phase: 'narrative-match',
  performanceEvent: {
    correct: false,
    attempts: (tracker && tracker.attempts) || 1,
    timeMs: (tracker && tracker.timeStarted) ? Date.now() - tracker.timeStarted : null
  },
  challengeSupports: ch.challengeSupports,
  affect: window.aceCheckinState || null
});
```

(Adjust based on the actual field names present in the existing call. Add `affect: window.aceCheckinState || null` to whatever fields are already there. Do NOT remove any existing fields.)

- [ ] **Step 2.3: Manual smoke test**

Run `npm run dev`. Complete the check-in with "storm cloud" (mathConfidence 1). Submit a wrong answer.

DevTools console:
- `[ACE v3] consult() returned N scaffolds` (N > 0 based on Phase 3 producers)
- Additionally, temporarily add a `console.log('[ACE v3] context.affect:', ...)` inside `handleIncorrectAnswer` to verify affect is populated. Remove that debug log before committing.

Verify: no runtime errors. Existing v3 scaffolds still render (they don't yet vary by affect until Task 3 lands).

- [ ] **Step 2.4: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): thread aceCheckinState into consult context as affect"
```

---

## Task 3: Implement F3 Offset frustration (tone modulation)

**Files:**
- Modify: `public/js/scaffolding-framework.js`. Replace `F3_offsetFrustration` stub body.
- Create: `tests/f3-offset-frustration.test.js`

**Interfaces:**
- Consumes: `Scaffold` (from `createScaffold`) and `affect` object with fields matching `aceCheckinState` shape
- Produces: same Scaffold, possibly with `payload.text` prepended with an affect-appropriate framing sentence

Tone-prepend heuristics for Phase 4:
- `mathConfidence <= 2` (storm or rain): prepend a validating framing. Example: `Math can feel tough sometimes. Here is one way in.`
- `engagementReadiness === 'maximum'` AND `attempts === 1`: prepend a "twist" framing that respects the confidence. Example: `You came in strong. This one has a twist.`
- Otherwise: return scaffold unchanged (neutral)

The `attempts` value is available on `context.performanceEvent.attempts`, but F3 receives `(scaffold, affect)` per the Phase 1+2 API. To keep the signature stable, F3 will read affect only. The "attempts === 1" gate for the maximum-readiness case can be implemented by consult() choosing to skip F3 on later attempts, OR by not passing that gate to F3. Phase 4 keeps it simple: the maximum-readiness prepend fires whenever engagementReadiness === 'maximum', regardless of attempts. Real tuning waits for user data.

- [ ] **Step 3.1: Write the failing tests**

Create `tests/f3-offset-frustration.test.js`:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F3 Offset frustration modifier', () => {
  let F3, createScaffold;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    F3 = globalThis.ScaffoldingFramework.Functions.F3_offsetFrustration;
    createScaffold = globalThis.ScaffoldingFramework.createScaffold;
  });

  const baseScaffold = () => createScaffold({
    supportKind: 'sentence-stem',
    functions: ['F2'],
    payload: { text: 'The hypotenuse is the ___ side.' }
  });

  it('returns scaffold unchanged when affect is null', () => {
    const s = baseScaffold();
    const out = F3(s, null);
    expect(out.payload.text).toBe('The hypotenuse is the ___ side.');
  });

  it('returns scaffold unchanged when affect is undefined', () => {
    const s = baseScaffold();
    const out = F3(s, undefined);
    expect(out.payload.text).toBe('The hypotenuse is the ___ side.');
  });

  it('returns scaffold unchanged for neutral affect (mathConfidence 3)', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 3, engagementReadiness: 'calm' });
    expect(out.payload.text).toBe('The hypotenuse is the ___ side.');
  });

  it('prepends validating framing when mathConfidence is 1', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 1 });
    expect(out.payload.text).toMatch(/^Math can feel tough sometimes\./);
    expect(out.payload.text).toContain('The hypotenuse is the ___ side.');
  });

  it('prepends validating framing when mathConfidence is 2', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 2 });
    expect(out.payload.text).toMatch(/^Math can feel tough sometimes\./);
  });

  it('does NOT prepend validating framing when mathConfidence is 4', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 4 });
    expect(out.payload.text).not.toMatch(/^Math can feel tough sometimes\./);
  });

  it('prepends twist framing when engagementReadiness is maximum', () => {
    const s = baseScaffold();
    const out = F3(s, { engagementReadiness: 'maximum' });
    expect(out.payload.text).toMatch(/^You came in strong\./);
  });

  it('validating framing wins over twist when both apply', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 1, engagementReadiness: 'maximum' });
    expect(out.payload.text).toMatch(/^Math can feel tough sometimes\./);
    expect(out.payload.text).not.toContain('You came in strong');
  });

  it('does not mutate the input scaffold', () => {
    const s = baseScaffold();
    const originalText = s.payload.text;
    F3(s, { mathConfidence: 1 });
    expect(s.payload.text).toBe(originalText);
  });

  it('handles missing payload gracefully (returns scaffold unchanged)', () => {
    const s = createScaffold({ supportKind: 'prompt', functions: ['F2'] });
    // payload defaults to { text: '' }
    const out = F3(s, { mathConfidence: 1 });
    // Empty text still gets prefix; result is just the prefix
    expect(out.payload.text).toMatch(/^Math can feel tough sometimes\./);
  });
});
```

- [ ] **Step 3.2: Run tests to see them fail**

Run: `npm test tests/f3-offset-frustration.test.js`
Expected: several tests fail (F3 currently returns scaffold unchanged for all inputs).

- [ ] **Step 3.3: Implement F3**

In `public/js/scaffolding-framework.js`, replace the F3 stub:

```javascript
// F3 Offset frustration (modifier). Adjusts tone based on student affect.
// Phase 4 heuristic:
//   - mathConfidence <= 2 (storm/rain): prepend validating framing
//   - engagementReadiness === 'maximum': prepend twist framing (respects confidence)
//   - validating wins over twist when both apply
//   - otherwise: return scaffold unchanged (neutral tone)
// Returns a NEW scaffold object (does not mutate input).
F3_offsetFrustration(scaffold, affect) {
  if (!scaffold) return scaffold;
  if (!affect || typeof affect !== 'object') return scaffold;

  let prefix = '';
  if (typeof affect.mathConfidence === 'number' && affect.mathConfidence <= 2) {
    prefix = 'Math can feel tough sometimes. Here is one way in. ';
  } else if (affect.engagementReadiness === 'maximum') {
    prefix = 'You came in strong. This one has a twist. ';
  }

  if (!prefix) return scaffold;

  const originalText = (scaffold.payload && scaffold.payload.text) || '';
  return Object.assign({}, scaffold, {
    payload: Object.assign({}, scaffold.payload, {
      text: prefix + originalText
    })
  });
},
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npm test tests/f3-offset-frustration.test.js`
Expected: all 10 tests pass.

- [ ] **Step 3.5: Run full suite (no regressions)**

Run: `npm test`
Expected: all tests across all files pass (framework smoke + F1 + F2 + orchestration + F3 = 35).

- [ ] **Step 3.6: Commit**

```bash
git add public/js/scaffolding-framework.js tests/f3-offset-frustration.test.js
git commit -m "feat(ace): implement F3 Offset frustration tone modulator"
```

---

## Task 4: Implement F6 Learning-by-doing (guardrail)

**Files:**
- Modify: `public/js/scaffolding-framework.js`. Replace `F6_learningByDoing` stub body.
- Create: `tests/f6-learning-by-doing.test.js`

**Interfaces:**
- Consumes: `Scaffold` (from `createScaffold`, possibly modified by F3)
- Produces: `{ allow: boolean, reason: string }`

Guardrail rules for Phase 4:
- Reject when scaffold is null/non-object
- Reject when `supportKind` is not one of the six known Support Kinds
- Reject when `payload.text` is empty or missing
- Reject when payload text starts with an answer-giveaway phrase (case-insensitive): `The answer is`, `The correct answer is`, `Just do`, `Simply`, `Just use`
- Otherwise: allow

Log denials to `console.warn` for observability. F6 is defense-in-depth; in Phase 4 with only developer-authored content, denials should be zero in practice. When Progressive Authoring lands in later phases, F6 becomes the runtime backstop.

- [ ] **Step 4.1: Write the failing tests**

Create `tests/f6-learning-by-doing.test.js`:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F6 Learning-by-doing guardrail', () => {
  let F6, createScaffold;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    F6 = globalThis.ScaffoldingFramework.Functions.F6_learningByDoing;
    createScaffold = globalThis.ScaffoldingFramework.createScaffold;
  });

  const validScaffold = () => createScaffold({
    supportKind: 'sentence-stem',
    functions: ['F2'],
    payload: { text: 'The hypotenuse is the ___ side.' }
  });

  it('rejects null scaffold', () => {
    const r = F6(null);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/scaffold/i);
  });

  it('rejects non-object scaffold', () => {
    expect(F6('a string').allow).toBe(false);
    expect(F6(42).allow).toBe(false);
  });

  it('rejects scaffold with unknown supportKind', () => {
    const s = { supportKind: 'unknown-kind', payload: { text: 'ok' } };
    const r = F6(s);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/supportKind/i);
  });

  it('rejects scaffold with empty payload text', () => {
    const s = { supportKind: 'prompt', payload: { text: '' } };
    const r = F6(s);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/payload/i);
  });

  it('rejects scaffold with missing payload', () => {
    const s = { supportKind: 'prompt' };
    const r = F6(s);
    expect(r.allow).toBe(false);
  });

  it('rejects "The answer is ..." payload', () => {
    const s = { supportKind: 'hint', payload: { text: 'The answer is 12.' } };
    const r = F6(s);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/answer|principle/i);
  });

  it('rejects "The correct answer is ..." payload', () => {
    const s = { supportKind: 'hint', payload: { text: 'The correct answer is 5.' } };
    expect(F6(s).allow).toBe(false);
  });

  it('rejects "Just do ..." payload', () => {
    const s = { supportKind: 'prompt', payload: { text: 'Just do the multiplication.' } };
    expect(F6(s).allow).toBe(false);
  });

  it('rejects "Simply ..." payload', () => {
    const s = { supportKind: 'prompt', payload: { text: 'Simply add the sides.' } };
    expect(F6(s).allow).toBe(false);
  });

  it('rejects "Just use ..." payload', () => {
    const s = { supportKind: 'prompt', payload: { text: 'Just use the calculator.' } };
    expect(F6(s).allow).toBe(false);
  });

  it('is case-insensitive on answer-giveaway detection', () => {
    const s = { supportKind: 'hint', payload: { text: 'THE ANSWER IS 12.' } };
    expect(F6(s).allow).toBe(false);
    const s2 = { supportKind: 'hint', payload: { text: 'the answer is 12.' } };
    expect(F6(s2).allow).toBe(false);
  });

  it('allows a valid Sentence Stem', () => {
    const r = F6(validScaffold());
    expect(r.allow).toBe(true);
  });

  it('allows valid text with "answer" mid-sentence (not giveaway pattern)', () => {
    const s = { supportKind: 'prompt', payload: { text: 'Check your answer against the sides.' } };
    expect(F6(s).allow).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run tests to see them fail**

Run: `npm test tests/f6-learning-by-doing.test.js`
Expected: most tests fail (F6 stub returns `{ allow: true, reason: 'phase-1-stub' }` for everything).

- [ ] **Step 4.3: Implement F6**

In `public/js/scaffolding-framework.js`, replace the F6 stub:

```javascript
// F6 Learning-by-doing (guardrail). Enforces Principle #1 (authentic tasks).
// Rejects malformed scaffolds and answer-giveaway patterns.
// Phase 4 rules:
//   - reject null/non-object scaffold
//   - reject unknown supportKind
//   - reject empty/missing payload text
//   - reject answer-giveaway prefixes (case-insensitive)
//   - otherwise allow
// Returns { allow: boolean, reason: string }. Denials logged to console.warn.
F6_learningByDoing(scaffold) {
  const knownKinds = new Set([
    'offload', 'prompt', 'sentence-stem', 'hint',
    'worked-example-fragment', 'problematizing-nudge'
  ]);
  const giveawayPrefixes = [
    'the answer is',
    'the correct answer is',
    'just do',
    'simply',
    'just use'
  ];

  const deny = (reason) => {
    console.warn('[ACE v3] F6 denied scaffold:', reason, scaffold);
    return { allow: false, reason };
  };

  if (!scaffold || typeof scaffold !== 'object') {
    return deny('scaffold must be an object');
  }
  if (!knownKinds.has(scaffold.supportKind)) {
    return deny('unknown supportKind: ' + scaffold.supportKind);
  }
  const text = scaffold.payload && scaffold.payload.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return deny('payload.text is empty or missing');
  }
  const lower = text.trim().toLowerCase();
  for (const prefix of giveawayPrefixes) {
    if (lower.startsWith(prefix)) {
      return deny('violates Principle #1 (authentic tasks): starts with "' + prefix + '"');
    }
  }
  return { allow: true, reason: 'passed-phase-4-checks' };
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npm test tests/f6-learning-by-doing.test.js`
Expected: all 13 tests pass.

- [ ] **Step 4.5: Run full suite (no regressions)**

Run: `npm test`
Expected: all tests pass (previous 35 + 13 new F6 tests = 48).

- [ ] **Step 4.6: Commit**

```bash
git add public/js/scaffolding-framework.js tests/f6-learning-by-doing.test.js
git commit -m "feat(ace): implement F6 Learning-by-doing guardrail"
```

---

## Task 5: Wire F3 and F6 into consult() orchestration

**Files:**
- Modify: `public/js/scaffolding-framework.js`. Update `consult()` body.
- Extend: `tests/consult-orchestration.test.js` (add tests for F3 modulation and F6 filtering)

**Interfaces:**
- Consumes: F1, F2, F3, F6 methods (F1/F2 implemented in Phase 3; F3/F6 in Tasks 3-4 of this phase)
- Produces: `consult()` return array now includes F3-modulated scaffolds, with F6-denied scaffolds filtered out

Updated Phase 4 orchestration order (per spec Section 4 subset):
1. Run F2 (strategic help)
2. Run F1 (simplify)
3. For each surviving scaffold, run F3 to modulate tone with context.affect
4. For each surviving (now modulated) scaffold, run F6 as guardrail
5. Keep only scaffolds where F6 returns `allow: true`
6. Return survivors

F4, F5, and Intervention Policy remain stubs and are not invoked in Phase 4 (deferred to Phases 6, 7).

- [ ] **Step 5.1: Extend the orchestration tests**

Append to `tests/consult-orchestration.test.js` (do NOT replace existing tests):

```javascript
describe('consult orchestration Phase 4 additions', () => {
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

  const promptSupport = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'the base prompt.' } };

  it('F3 modulates scaffold tone when affect indicates low confidence', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1 },
      affect: { mathConfidence: 1 }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].payload.text).toMatch(/^Math can feel tough sometimes\./);
    expect(scaffolds[0].payload.text).toContain('the base prompt.');
  });

  it('F3 modulates with twist framing on maximum readiness', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1 },
      affect: { engagementReadiness: 'maximum' }
    });
    // Note: F2 would normally skip first attempt at maximum readiness (per Phase 3),
    // so this expects zero scaffolds to survive
    expect(scaffolds).toHaveLength(0);
  });

  it('F3 modulates with twist framing on maximum readiness (attempt 2)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 2 },
      affect: { engagementReadiness: 'maximum' }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].payload.text).toMatch(/^You came in strong\./);
  });

  it('F6 filters out scaffolds with giveaway payload', () => {
    const giveawaySupport = {
      supportKind: 'hint',
      functions: ['F2'],
      payload: { text: 'The answer is 12.' }
    };
    const scaffolds = consult({
      challengeSupports: [giveawaySupport],
      performanceEvent: { correct: false, attempts: 3 }
    });
    // F2 would produce this, but F6 denies it
    expect(scaffolds).toHaveLength(0);
  });

  it('mixed pool: valid scaffold survives F6, giveaway is filtered', () => {
    const goodPrompt = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'good prompt.' } };
    const goodOffload = { supportKind: 'offload', functions: ['F1'], payload: { text: 'good offload.' } };
    // Both F1 and F2 fire on attempt 3 with time > threshold, both pass F6
    const scaffolds = consult({
      challengeSupports: [goodPrompt, goodOffload],
      performanceEvent: { correct: false, attempts: 3, timeMs: 60000 }
    });
    expect(scaffolds).toHaveLength(2);
    expect(scaffolds.every(s => s.payload.text.length > 0)).toBe(true);
  });

  it('F3 runs before F6 in the pipeline (F3-modulated scaffold still passes F6)', () => {
    // F3 prepends "Math can feel tough sometimes. Here is one way in. " (starts with "M", not a giveaway)
    // Result should pass F6
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1 },
      affect: { mathConfidence: 1 }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].payload.text).toMatch(/^Math can feel tough/);
  });
});
```

- [ ] **Step 5.2: Run tests to see them fail**

Run: `npm test tests/consult-orchestration.test.js`
Expected: several new tests fail (consult() still uses Phase 3 body that doesn't invoke F3 or F6).

- [ ] **Step 5.3: Update consult() to invoke F3 and F6**

In `public/js/scaffolding-framework.js`, replace the `consult` body:

```javascript
consult(context) {
  if (!context || typeof context !== 'object') return [];
  const fns = globalThis.ScaffoldingFramework.Functions;

  // Phase 4 evaluation order (subset of spec Section 4):
  // F2 -> F1 -> F3 (modulator) -> F6 (guardrail).
  // F4, F5, and Intervention Policy are wired in later phases.

  const producedScaffolds = [];
  const f2Result = fns.F2_strategicHelp(context);
  if (f2Result) producedScaffolds.push(f2Result);
  const f1Result = fns.F1_simplify(context);
  if (f1Result) producedScaffolds.push(f1Result);

  // F3 modulator: adjust tone on each surviving scaffold
  const modulated = producedScaffolds.map(s => fns.F3_offsetFrustration(s, context.affect));

  // F6 guardrail: filter out scaffolds that violate Principle #1
  const allowed = modulated.filter(s => {
    const verdict = fns.F6_learningByDoing(s);
    return verdict.allow;
  });

  return allowed;
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npm test tests/consult-orchestration.test.js`
Expected: all 11 orchestration tests pass (5 Phase 3 + 6 Phase 4 additions).

- [ ] **Step 5.5: Run full suite**

Run: `npm test`
Expected: 54 tests total pass (framework smoke 4 + F1 7 + F2 9 + orchestration 11 + F3 10 + F6 13).

- [ ] **Step 5.6: Browser smoke test, affect drives tone**

Run `npm run dev`. Do TWO runs:

Run A (anxious student):
- Complete check-in with mathConfidence 1 (storm cloud), understanding "confused", readiness "calm"
- Enter Athens challenge, submit wrong answer
- Expected in feedback panel: Support card payload STARTS with `Math can feel tough sometimes. Here is one way in.` followed by the base Pythagoras support text

Run B (confident student):
- Refresh, complete check-in with mathConfidence 5 (sunshine), understanding "confident", readiness "maximum"
- Enter Athens challenge, submit wrong answer (first attempt)
- Expected: no support card renders (F2 skips maximum-readiness first attempt per Phase 3)
- Submit a second wrong answer (still on Challenge 1, attempt 2)
- Expected: Support card payload STARTS with `You came in strong. This one has a twist.`

- [ ] **Step 5.7: Commit**

```bash
git add public/js/scaffolding-framework.js tests/consult-orchestration.test.js
git commit -m "feat(ace): wire F3 modulator and F6 guardrail into consult orchestration"
```

---

## Task 6: End-to-end verification and push

**Files:** no file changes

**Interfaces:** consumes all prior task commits; produces origin branch update ready to merge

- [ ] **Step 6.1: Full test suite**

Run: `npm test`
Expected: all tests pass (54 total).

- [ ] **Step 6.2: End-to-end browser walkthrough**

Run `npm run dev`. Do THREE runs:

Run A (anxious student, mathConfidence 1):
- Complete check-in with all "low" answers
- Play Challenge 1 (Athens), submit wrong answer on first attempt
- Verify Support card starts with validating framing
- Verify existing v2 scaffold-path button still triggers where it would have

Run B (confident student, engagementReadiness 'maximum'):
- Fresh page load, complete check-in with all "high" answers
- Play Challenge 1 (Athens), submit wrong answer on first attempt
- Verify NO scaffold card renders (F2 skips maximum-readiness first attempt)
- Submit second wrong answer (attempt 2)
- Verify Support card starts with twist framing

Run C (skip check-in, neutral):
- Fresh page load, click "Jump straight to the quest"
- Play Challenge 1, submit wrong answer
- Verify Support card renders with UNMODIFIED base text (F3 no-op when affect is all null)

Also verify:
- Correct-answer flow renders identically to before
- Fast-track flow still triggers when confidence is high in mastery
- No JavaScript errors in console

- [ ] **Step 6.3: Verify branch state**

Run:
```bash
git status
git log --oneline origin/claude/kind-solomon-9be8a0..HEAD 2>/dev/null || git log --oneline -10
```

- [ ] **Step 6.4: Push**

```bash
git push
```

Cloudflare Pages preview build should trigger.

---

## Notes for the executor

- **If check-in Q4 input has no id, use querySelector by container.** The plan's `finishCheckin` uses `document.querySelector('#checkin-q4 input[type="text"]')`. Verify this selector matches the actual HTML before running.
- **Do not persist to D1 in this phase.** In-memory `window.aceCheckinState` only. Persistence is a later phase.
- **Do not add new Support Kinds** to F6's `knownKinds` set. If a producer starts creating a new Support Kind in a later phase, F6 will need updating then. Adding proactively risks drift.
- **F3 prepends kept short and no em-dashes.** The two provided prefixes ("Math can feel tough sometimes. Here is one way in." and "You came in strong. This one has a twist.") use periods and are short by design. If you edit them, keep to the same constraints.
- **F6 giveaway detection is intentionally simple.** It catches obvious violations from developer typos or teacher-authoring accidents. Not a security boundary; Progressive Authoring UX (later phase) is where real content review happens.
- **Rendering does not change in Phase 4.** The existing scaffold card rendering from Phase 3 Task 7 handles F3-modulated payload text as-is. No CSS or JS rendering changes needed.
