# ACE v3.0 — Phase 1+2 Implementation Plan (Foundation & Framework Skeleton)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the ScaffoldingFramework (Lens 4) module skeleton into the game code and lock the v3 naming conventions, with zero student-facing behavior change.

**Architecture:** Add a namespaced `window.ScaffoldingFramework` object inside `public/index.html` (single-file game). Define the six Support Kind constants, the Scaffold instance shape, and stub implementations of the six-function API (all returning `null`). Wire a "consult" call from Feedback Loop's Narrative Match step into the Framework; Framework returns empty, so existing behavior is preserved 1:1. Update README to reflect renames and the Scaffold Path deprecation flag. Existing `scaffoldActive` / `fastTrackActive` / `aceChooseRoute()` logic stays fully in place (deprecation happens in Phase 9).

**Tech Stack:** Vanilla JavaScript in a single-file HTML app (`public/index.html`, 7064 lines). Cloudflare Pages hosting. No build step. No test framework yet.

**Spec:** [../specs/2026-08-30-ace-scaffolding-lens4-design.md](../specs/2026-08-30-ace-scaffolding-lens4-design.md)

## Global Constraints

- **No em-dashes anywhere** — code comments, commit messages, JSDoc, README copy. Use commas, colons, periods, parentheses, or "to"/"and". (Per Linda's global CLAUDE.md rule.)
- **Banned AI-tell words in all copy** — never write: "honest", "honestly", "quiet", "quietly", "genuinely", "truly", "landed" (as arrival metaphor). Applies to comments, commit messages, README, UI copy.
- **Banned AI-tell phrases** — no "what is working", "worth [verb]-ing", reveal-list triptychs (X / not-X / next-step). Say things plainly.
- **Zero student-facing behavior change** — this phase adds inert scaffolding. Every game screen must render identically before and after. If any smoke test shows a difference, that's a bug.
- **Preserve v2 code untouched** — `scaffoldActive`, `fastTrackActive`, `aceChooseRoute()`, `scaffoldChallenges`, `fastTrackVariants`, `enterScaffold()`, `handleFastTrackOffer()`, `.scaffold-panel` CSS, all `{scaffoldHint}` template variables must remain identical after this plan. Phase 9 handles their retirement.
- **Naming discipline** — the word "scaffolding" going forward refers exclusively to Lens 4 concerns. The existing `scaffoldActive` / `enterScaffold()` names stay for now (they are code identifiers pending Phase 9 deprecation), but any NEW identifier this plan introduces must not overload the term.
- **Commit granularity** — each task ends with one commit. Commit messages follow the repo convention (`feat:` / `chore:` / `docs:` / `fix:` prefix, lowercase, one sentence).
- **File location for new code** — everything goes inside `public/index.html`. No new files under `public/` for this phase. (Extraction to separate .js is out of scope; may happen in Phase 3 when policy logic starts.)

---

## File Structure

| File | Change | Purpose |
|---|---|---|
| `public/index.html` | Modify (~150 lines added around line 4553, before the ACE ROUTING section) | Add ScaffoldingFramework namespace with Support Kinds, Scaffold shape, six-function stubs, consult method |
| `public/index.html` | Modify (~5 lines added around line 5450) | Insert consult call from Feedback Loop's Narrative Match into Framework; assert empty return; preserve existing feedback path |
| `README.md` | Modify (~15 lines) | Rename "Scaffold Path" bullet to deprecation note; add "Progressive Authoring" naming note; link to v3 spec |
| `docs/superpowers/plans/2026-08-31-ace-v3-phase-1-foundation.md` | Create (this plan) | Reference doc for the implementation |

---

## Task 1: Add ScaffoldingFramework module skeleton

**Files:**
- Modify: `public/index.html:4553` (insert before line 4554, immediately before `let scaffoldActive` declaration and the ACE ROUTING comment banner)

**Interfaces:**
- Consumes: nothing (this task establishes the module)
- Produces: `window.ScaffoldingFramework` global with a `.version` string, an empty `.SupportKinds` object placeholder, and a `.consult(context)` method that returns an empty array `[]`. Task 2 fills in Support Kinds. Task 5 wires callers.

- [ ] **Step 1.1: Locate the insertion point**

Open `public/index.html`. Find line 4554 (`let currentTier = 'extension';`). The insertion happens directly above line 4554, immediately after the `let masteryMap = { ... };` block and before the `let currentTier` declaration.

Run: `grep -n "let currentTier" public/index.html`
Expected: one match at line 4554.

- [ ] **Step 1.2: Insert the ScaffoldingFramework namespace block**

Insert the following block above line 4554 (adjust indentation to match surrounding code, which uses 2-space indent inside `<script>`):

```javascript
// ═══ ACE v3.0 SCAFFOLDING FRAMEWORK (LENS 4) ═══
// Phase 1+2 skeleton. Consult pattern established; policy logic added in later phases.
// Spec: docs/superpowers/specs/2026-08-30-ace-scaffolding-lens4-design.md
//
// This module owns runtime scaffolding decisions per the ACE v3 spec. It does
// NOT own per-concept mastery scores (Mastery Map), affect (Learner Profile),
// or the challengeSupports pool per challenge (Challenge). It consults those.
//
// In this phase all six-function stubs return null and consult() returns [].
// Existing v2 behavior via scaffoldActive / fastTrackActive / aceChooseRoute()
// is untouched and will be retired in Phase 9.
window.ScaffoldingFramework = {
  version: 'v3.0-phase-1',
  SupportKinds: {},   // Task 2 fills these
  Functions: {},      // Task 4 fills these (F1..F6)

  // Consult method called by Feedback Loop at Step 4 (Narrative Match) and
  // Step 5 (Calibration Check). Also invoked proactively mid-solve.
  // context: { studentId, challengeIdx, phase, performanceEvent?, affect?, mastery? }
  // Returns: array of Scaffold instances (empty in this phase)
  consult(context) {
    if (!context || typeof context !== 'object') return [];
    // No producers wired yet. Later phases add F1..F5 invocations and
    // Intervention Policy here.
    return [];
  }
};
console.log('[ACE v3] ScaffoldingFramework loaded:', window.ScaffoldingFramework.version);
```

- [ ] **Step 1.3: Run the dev server**

Run: `npm run dev`
Expected: Wrangler starts a local Pages dev server on `http://127.0.0.1:8788` (or similar port). No errors in the terminal.

- [ ] **Step 1.4: Manual smoke test — module loads**

Open `http://127.0.0.1:8788` in a browser. Open DevTools (F12), go to Console tab. Reload the page.

Expected console output:
- One line containing `[ACE v3] ScaffoldingFramework loaded: v3.0-phase-1`
- No JavaScript errors elsewhere

Also run in Console:
```javascript
window.ScaffoldingFramework
```

Expected: object with `version`, `SupportKinds`, `Functions`, `consult` properties.

```javascript
window.ScaffoldingFramework.consult({ studentId: 'test' })
```

Expected: `[]` (empty array).

- [ ] **Step 1.5: Manual smoke test — student behavior unchanged**

Navigate through the game (sign in as a test student, enter a challenge, submit a wrong answer, submit a correct answer). Everything should behave exactly as before this task.

Expected: no visible change in game behavior. Feedback panel still fires. Scaffold panel and fast-track still work as before.

- [ ] **Step 1.6: Commit**

```bash
git add public/index.html
git commit -m "chore: add empty ScaffoldingFramework (Lens 4) skeleton"
```

---

## Task 2: Define Support Kind constants

**Files:**
- Modify: `public/index.html` (inside the `SupportKinds: {}` object added in Task 1)

**Interfaces:**
- Consumes: `window.ScaffoldingFramework` from Task 1
- Produces: `window.ScaffoldingFramework.SupportKinds` populated with six string constants: `OFFLOAD`, `PROMPT`, `SENTENCE_STEM`, `HINT`, `WORKED_EXAMPLE_FRAGMENT`, `PROBLEMATIZING_NUDGE`. Each value is a lowercase kebab-case string used as the wire-level identifier. Task 3 references these in the Scaffold shape.

- [ ] **Step 2.1: Replace the empty SupportKinds placeholder**

Change the line `SupportKinds: {},` inside the ScaffoldingFramework object to:

```javascript
  // Support Kinds are curriculum-agnostic. Each maps to one or more of the
  // six paper functions (see spec Section 4). Wire-level identifier is the
  // lowercase kebab-case string on the right.
  SupportKinds: {
    OFFLOAD:                  'offload',
    PROMPT:                   'prompt',
    SENTENCE_STEM:            'sentence-stem',
    HINT:                     'hint',
    WORKED_EXAMPLE_FRAGMENT:  'worked-example-fragment',
    PROBLEMATIZING_NUDGE:     'problematizing-nudge'
  },
```

- [ ] **Step 2.2: Manual smoke test — Support Kinds present**

Reload the page. In DevTools Console:

```javascript
Object.keys(window.ScaffoldingFramework.SupportKinds)
```

Expected: array of length 6 with values `["OFFLOAD", "PROMPT", "SENTENCE_STEM", "HINT", "WORKED_EXAMPLE_FRAGMENT", "PROBLEMATIZING_NUDGE"]`.

```javascript
window.ScaffoldingFramework.SupportKinds.SENTENCE_STEM
```

Expected: string `"sentence-stem"`.

- [ ] **Step 2.3: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): define six Support Kind constants for v3 framework"
```

---

## Task 3: Define the Scaffold instance factory

**Files:**
- Modify: `public/index.html` (inside the ScaffoldingFramework object, after `SupportKinds`)

**Interfaces:**
- Consumes: `window.ScaffoldingFramework.SupportKinds` from Task 2
- Produces: `window.ScaffoldingFramework.createScaffold(spec)` factory function that returns a plain object matching the Scaffold shape from the spec (Section 3). Task 4 uses this shape in function stubs. Task 5's consult wiring returns arrays of these.

- [ ] **Step 3.1: Add the createScaffold factory**

Insert the following inside the `ScaffoldingFramework` object, between `SupportKinds` and `Functions`:

```javascript
  // Scaffold instance shape. Every Scaffold produced by a Function has these
  // fields. Spec Section 3.
  //   supportKind:   one of SupportKinds values
  //   functions:     array of function IDs served: ['F1'] | ['F2', 'F4'] etc.
  //   payload:       { text: string, template?: string, vars?: object }
  //   source:        'system' | 'teacher-authored' | 'teacher-live' | 'student-requested'
  //   fadeStateRef:  { studentId, concept, supportKind } | null
  //   producedAt:    ISO timestamp
  createScaffold(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('createScaffold requires a spec object');
    }
    return {
      supportKind:   spec.supportKind,
      functions:     Array.isArray(spec.functions) ? spec.functions.slice() : [],
      payload:       spec.payload || { text: '' },
      source:        spec.source || 'system',
      fadeStateRef:  spec.fadeStateRef || null,
      producedAt:    new Date().toISOString()
    };
  },
```

Note the comma at the end (keeps the object literal valid).

- [ ] **Step 3.2: Manual smoke test — factory works**

Reload the page. In DevTools Console:

```javascript
const s = window.ScaffoldingFramework.createScaffold({
  supportKind: window.ScaffoldingFramework.SupportKinds.SENTENCE_STEM,
  functions: ['F2'],
  payload: { text: 'The hypotenuse must be ___ because ___' }
});
console.log(s);
```

Expected output: object with `supportKind: "sentence-stem"`, `functions: ["F2"]`, `payload: { text: "..." }`, `source: "system"`, `fadeStateRef: null`, `producedAt: "2026-08-31T..."`.

Also verify:
```javascript
try { window.ScaffoldingFramework.createScaffold(null); } catch (e) { console.log('threw:', e.message); }
```

Expected console output: `threw: createScaffold requires a spec object`.

- [ ] **Step 3.3: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): add createScaffold factory for v3 instances"
```

---

## Task 4: Define six-function API stubs

**Files:**
- Modify: `public/index.html` (inside the ScaffoldingFramework object, in the `Functions: {}` placeholder)

**Interfaces:**
- Consumes: `SupportKinds`, `createScaffold` from Tasks 2-3
- Produces: `window.ScaffoldingFramework.Functions` populated with six methods (`F1_simplify`, `F2_strategicHelp`, `F3_offsetFrustration`, `F4_problematize`, `F5_reflect`, `F6_learningByDoing`) all returning `null` (producers) or `{ allow: true, reason: 'phase-1-stub' }` (guardrail) or the input Scaffold unmodified (modifier). Task 5's consult method walks these but they produce nothing yet.

- [ ] **Step 4.1: Replace the empty Functions placeholder**

Change the line `Functions: {},` inside the ScaffoldingFramework object to:

```javascript
  // Six-function API. Producers return a Scaffold or null. Modifiers take
  // a Scaffold and return a (possibly-modified) Scaffold. Guardrails return
  // { allow: bool, reason: string }. Spec Section 4.
  // Phase 1+2: all functions are inert stubs. Real logic added Phase 3+.
  Functions: {
    // F1 Simplify (producer). Returns Offload or Worked-Example Fragment or null.
    F1_simplify(context) {
      return null;
    },
    // F2 Strategic help (producer). Returns Prompt, Hint, or Sentence Stem or null.
    F2_strategicHelp(context) {
      return null;
    },
    // F3 Offset frustration (modifier). Adjusts tone; returns scaffold unmodified in stub.
    F3_offsetFrustration(scaffold, affect) {
      return scaffold;
    },
    // F4 Problematize (producer). Returns Problematizing Nudge or null.
    F4_problematize(context) {
      return null;
    },
    // F5 Reflect (producer). Returns Reflection Prompt or null.
    F5_reflect(context) {
      return null;
    },
    // F6 Learning-by-doing (guardrail). Enforces Principle #1.
    F6_learningByDoing(scaffold) {
      return { allow: true, reason: 'phase-1-stub' };
    }
  },
```

- [ ] **Step 4.2: Manual smoke test — stubs callable**

Reload the page. In DevTools Console:

```javascript
const fns = Object.keys(window.ScaffoldingFramework.Functions);
console.log('function count:', fns.length, '| functions:', fns);
```

Expected: `function count: 6 | functions: ["F1_simplify", "F2_strategicHelp", "F3_offsetFrustration", "F4_problematize", "F5_reflect", "F6_learningByDoing"]`.

```javascript
window.ScaffoldingFramework.Functions.F1_simplify({});
window.ScaffoldingFramework.Functions.F4_problematize({});
```

Expected: both return `null`.

```javascript
window.ScaffoldingFramework.Functions.F6_learningByDoing({});
```

Expected: `{ allow: true, reason: 'phase-1-stub' }`.

- [ ] **Step 4.3: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): add six-function API stubs (F1-F6) for v3 framework"
```

---

## Task 5: Wire Feedback Loop consult call

**Files:**
- Modify: `public/index.html` (inside the wrong-answer feedback function, around line 5450, before the existing feedback rendering)

**Interfaces:**
- Consumes: `window.ScaffoldingFramework.consult` from Task 1
- Produces: A call site in Feedback Loop that consults the Framework at Narrative Match step. Return value is captured in a local variable, logged to console, and NOT applied to UI in this phase (behavior unchanged). Later phases replace the log with actual narrative composition.

- [ ] **Step 5.1: Locate the wrong-answer feedback path**

Run: `grep -n "showIncorrectFeedback\|incorrect feedback" public/index.html | head -5`

Identify the function that renders the incorrect-answer feedback panel. Expected location: around line 5450-5500. It's the function that handles the "Practice with easier numbers first" button (Task 1's smoke test path).

Read lines 5440-5480 of `public/index.html` to confirm the entry point.

- [ ] **Step 5.2: Add the consult call at Narrative Match**

At the start of the incorrect-feedback function (immediately after the function signature `{`), insert:

```javascript
  // ═══ ACE v3.0 consult: Feedback Loop, Step 4 (Narrative Match) ═══
  // Phase 1+2: framework returns [] here (no producers wired). Later phases
  // populate this with runtime scaffolds. UI is not affected in this phase.
  try {
    const v3Scaffolds = window.ScaffoldingFramework.consult({
      studentId:  (window.currentUser && window.currentUser.id) || null,
      challengeIdx: currentChallenge,
      phase: 'narrative-match',
      performanceEvent: { correct: false, attempts: (tracker && tracker.attempts) || 1 }
    });
    console.log('[ACE v3] consult() returned', v3Scaffolds.length, 'scaffolds');
  } catch (err) {
    console.error('[ACE v3] consult failed (non-fatal in Phase 1):', err);
  }
```

Adjust `currentChallenge` and `tracker` references to match the actual variables in scope at the insertion point. If the function does not have direct access to those variables, pass whatever context IS available and note this in the comment (`// TODO(phase-3): add attempts context when tracker becomes available here`), but only if you truly cannot reach the variable.

- [ ] **Step 5.3: Manual smoke test — consult call fires**

Reload the page. Sign in as a test student. Enter a challenge. Submit a wrong answer.

Expected console output (in addition to any existing logs):
- One line: `[ACE v3] consult() returned 0 scaffolds`

No visible change in the feedback panel behavior. Practice-easier-numbers button still appears if the existing logic wanted it. Scaffold/fast-track flags still work.

- [ ] **Step 5.4: Manual smoke test — full playthrough**

Play through all four challenges (Samos, Athens, Rhodes, Alexandria). Submit a mix of correct and incorrect answers. Verify:

- Every wrong-answer submission logs `[ACE v3] consult() returned 0 scaffolds`
- No JavaScript errors
- Existing scaffold and fast-track paths still trigger when they would have before

- [ ] **Step 5.5: Commit**

```bash
git add public/index.html
git commit -m "feat(ace): wire Feedback Loop Narrative Match consult call to v3 framework"
```

---

## Task 6: Update README naming and deprecation flag

**Files:**
- Modify: `README.md` line 20 (the "Scaffold Path" bullet)
- Modify: `README.md` (add short section under ACE Features about naming migration)

**Interfaces:**
- Consumes: nothing (docs only)
- Produces: README that reflects v3 spec naming and flags the Scaffold Path deprecation. No code impact.

- [ ] **Step 6.1: Read current README ACE Features section**

Run: `grep -n "Scaffold Path\|Fast-Track Path\|Feedback Loop\|Scaffolded Authoring" README.md`

Confirm line 20 has the Scaffold Path bullet and identify any other affected lines.

- [ ] **Step 6.2: Replace the Scaffold Path bullet**

Change line 20 from:
```
  - 🌿 **Scaffold Path** — Students who struggle get narrative side-quests with easier numbers
```

To:
```
  - 🌿 **Scaffold Path** _(deprecated in ACE v3, retired in Phase 9)_. v2 mechanism that routed struggling students to narrative side-quests with easier numbers. v3 replaces this with in-place scaffolding that keeps students inside the authentic challenge. See the [ACE v3 spec](docs/superpowers/specs/2026-08-30-ace-scaffolding-lens4-design.md).
```

- [ ] **Step 6.3: Add a naming migration note**

Immediately after the numbered "Student Experience" list (after line 32 approximately), add a new subsection:

```markdown
## ACE v3.0 Naming (in progress)

The engine is migrating to the v3.0 spec. Terminology in flight:

- **Scaffolding Framework** (Lens 4, new): the runtime policy layer for supports, fading, reflection, and productive-failure decisions
- **`challengeSupports`** (was `scaffoldingSet` in v2 spec): the per-challenge pool of supports the framework can draw from
- **Progressive Authoring** (was "Scaffolded Authoring"): the teacher-facing L1/L2/L3 authoring UX
- **Scaffold Path** (v2 code): deprecated in v3, retirement in Phase 9

Full spec: [docs/superpowers/specs/2026-08-30-ace-scaffolding-lens4-design.md](docs/superpowers/specs/2026-08-30-ace-scaffolding-lens4-design.md)
```

- [ ] **Step 6.4: Smoke test — README renders**

Run: `head -80 README.md`

Verify the file reads cleanly and the new content is in place.

Optionally push a preview and view the rendered README on GitHub to confirm formatting (headings, links, italics render correctly).

- [ ] **Step 6.5: Commit**

```bash
git add README.md
git commit -m "docs: reflect ACE v3 naming and flag Scaffold Path deprecation"
```

---

## Task 7: Push and verify remote build

**Files:**
- No file changes

**Interfaces:**
- Consumes: all prior task commits
- Produces: origin branch updated; Cloudflare Pages preview build (if enabled) reflects Phase 1+2

- [ ] **Step 7.1: Verify local branch state**

Run:
```bash
git log --oneline origin/claude/kind-solomon-9be8a0..HEAD
git status
```

Expected: 6 new commits on top of the last pushed commit (`c0ad05a` was the spec doc; new commits are the 6 tasks above, in order). Working tree clean.

- [ ] **Step 7.2: Push**

Run: `git push`

Expected: push succeeds. Cloudflare Pages (if configured for branch previews) starts a build for this branch within ~1 minute.

- [ ] **Step 7.3: Verify remote preview**

Wait ~2 minutes. Open the Cloudflare Pages preview URL for this branch (format: `https://claude-kind-solomon-9be8a0.questsim-ace-rebuild.pages.dev` or similar).

Reload with DevTools open. Verify:
- Console shows `[ACE v3] ScaffoldingFramework loaded: v3.0-phase-1`
- Navigate through a challenge; wrong answer logs `[ACE v3] consult() returned 0 scaffolds`
- All game behavior identical to production

- [ ] **Step 7.4: Optional — open a draft PR for outside review**

Skip this step unless Linda has approved opening a PR. If she has:

```bash
gh pr create --draft \
  --base claude/integrate-triangle-types-activity-v0P98 \
  --head claude/kind-solomon-9be8a0 \
  --title "feat(ace): v3.0 Phase 1+2 — Scaffolding Framework skeleton (no behavior change)" \
  --body "$(cat <<'EOF'
## Summary
Introduces the ScaffoldingFramework (Lens 4) module skeleton per the ACE v3.0 spec. Adds Support Kinds, Scaffold instance factory, six-function API stubs, and a consult call site in Feedback Loop's Narrative Match step. All stubs return empty; existing scaffold/fast-track routing is untouched.

## What ships
- `window.ScaffoldingFramework` global in `public/index.html`
- Six Support Kinds (`Offload`, `Prompt`, `Sentence Stem`, `Hint`, `Worked-Example Fragment`, `Problematizing Nudge`)
- Six-function API (F1-F6) as inert stubs
- Feedback Loop consult call (returns 0 scaffolds)
- README naming migration note; Scaffold Path deprecation flag

## What does NOT change
- Zero student-facing behavior change
- v2 `scaffoldActive` / `fastTrackActive` / `aceChooseRoute()` untouched (Phase 9 handles their retirement)
- No new files, no new deps, no test framework yet (Phase 3 adds Vitest when policy logic starts)

## Spec
docs/superpowers/specs/2026-08-30-ace-scaffolding-lens4-design.md

## Test plan
- [ ] Load game, verify `[ACE v3] ScaffoldingFramework loaded: v3.0-phase-1` in console
- [ ] Submit wrong answer, verify `[ACE v3] consult() returned 0 scaffolds` in console
- [ ] Play full four-challenge quest, verify no visible behavior change

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for the executor

- **If you cannot reach a variable at the insertion point** (Task 5), do not import or restructure. Pass a partial context and add a `// TODO(phase-3): expand context` comment. Full context refactor is a Phase 3 job.
- **If the dev server fails to start**, check that `wrangler` is installed (`npm install`) and that no other process holds port 8788.
- **If a smoke test fails**, do not proceed to the next task. Diagnose the failure. This phase's contract is zero behavior change; any deviation is a bug.
- **Do not add tests, test frameworks, or CI configuration** in this phase. That belongs to Phase 3.
- **Do not touch v2 scaffold or fast-track code** even if you notice cleanup opportunities. Phase 9 handles their retirement.
- **Do not update the architecture site** (lin564/questsim-ace-architecture) in this phase. Adding the Lens 4 tab is a separate deliverable, tracked as follow-up work.
