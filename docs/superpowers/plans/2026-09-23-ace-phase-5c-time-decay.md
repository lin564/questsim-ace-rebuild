# ACE v3 Phase 5c Time Decay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring scaffolding back for a student who returns to a concept after an absence, without changing the mastery confidence they earned.

**Architecture:** `FadingPolicy.computeFadeLevel` gains a third input, the concept entry's last-attempt timestamp, and subtracts 0.02 of fade level for every day of absence beyond a 7 day grace period, floored at 0. The client passes the timestamp it already receives from the server, so nothing new is stored. The fast-track route then decides from that same effective fade level instead of keeping its own copy of the rules, and the unused browser-storage helpers from Phase 5a are deleted.

**Tech Stack:** vanilla JS in `public/js/scaffolding-framework.js` and `public/index.html`, vitest 1.x with jsdom.

**Spec:** `docs/superpowers/specs/2026-09-23-ace-phase-5c-time-decay-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- **No em-dashes anywhere.** Not in code, comments, tests, console strings, or commit messages. Use commas, colons, periods, parentheses, or the words "to" and "and". This is absolute.
- **Banned words, never use them anywhere:** "honest", "honestly", "quiet", "quietly", "genuinely", "truly", "landed" (or "land"/"lands" as an arrival metaphor). Banned phrasings: "worth noting", "worth flagging", "what is working", "the one move that", "got N things".
- **Constants, verbatim from spec 3.1:** `DECAY_GRACE_DAYS` is 7, `DECAY_PER_DAY` is 0.02, the floor is 0.
- **Formula, verbatim from spec 3.2:** `decayed = max(0, c - max(0, d - DECAY_GRACE_DAYS) * DECAY_PER_DAY)` where `c` is the clamped confidence and `d` is whole days since the last attempt.
- **Order inside `computeFadeLevel`, verbatim from spec 4:** clamp, then decay, then the unassisted-success cap of `UNASSISTED_GATE_CAP` (0.799).
- **Bands, unchanged:** full below 0.4, delayed from 0.4 to 0.8, withdrawn at 0.8 and above. `ACE_FASTTRACK_THRESHOLD` stays 0.85.
- **Decay never fires on unreadable data** (spec 8): a missing, null, non-string, unparseable, or future `updated_at` all mean zero days and therefore no decay. Bad data must leave a student with more support, never less.
- **Confidence is never modified** (spec 3.5). This phase writes nothing to `mastery_state`, to D1, or to the teacher dashboard.
- **Test conventions:** vitest is configured with `include: ['tests/**/*.test.js']` and `globals: true`. The existing 150 tests must pass at every commit (`npm test`). `tests/fading-policy.test.js` loads the framework by reading the source file and calling `eval`, so no import path changes.
- **Do not edit** anything inside the `window.QS = (() => {` IIFE near the bottom of `public/index.html` (it holds a second, unrelated `loadChallenge` and `submitAnswer`), and do not touch `lib/mastery-rule.ts` or `functions/`.
- **Line numbers in this plan are anchors from the branch at commit `8c48300`.** Locate every edit by the quoted text, not by the number.
- **Commits:** one per task, message as given, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Shell:** commands are bash (the Bash tool). Run them from the worktree root `C:/Users/berna/OneDrive/Documents/GitHub/questsim-ace-rebuild/.claude/worktrees/priceless-mahavira-3652be`. `$TMP` in a command means a scratch directory outside the repo; each block sets it with `TMP="${TMP:-$(mktemp -d)}"`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `public/js/scaffolding-framework.js` (modify) | The two constants, a days-elapsed helper, and decay inside `computeFadeLevel`. All policy lives here. |
| `tests/fading-policy.test.js` (modify) | Unit coverage for the curve, the boundaries, the interaction with the unassisted gate, and every bad-data case. |
| `public/index.html` (modify) | Pass the timestamp through, decide fast-track from the effective level, delete the three browser-storage functions. No policy logic. |

---

### Task 1: Decay in the Fading Policy

**Files:**
- Modify: `public/js/scaffolding-framework.js` (the `FadingPolicy` object, currently lines 208 to 247)
- Modify: `tests/fading-policy.test.js` (append)

**Interfaces:**
- Consumes: the existing `UNASSISTED_GATE_CAP` (0.799) and `hasUnassistedSuccess(counts)`.
- Produces (used by Task 2):
  - `FadingPolicy.DECAY_GRACE_DAYS` = 7
  - `FadingPolicy.DECAY_PER_DAY` = 0.02
  - `FadingPolicy.daysSince(timestamp, now)` returns whole days elapsed, or 0 when the timestamp is unreadable or in the future. `now` is optional and defaults to the current time.
  - `FadingPolicy.computeFadeLevel(confidence, counts, lastAttemptAt)` where `lastAttemptAt` is an ISO string or omitted. Called with one or two arguments it behaves exactly as it does today.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fading-policy.test.js`, inside the outer `describe('FadingPolicy', ...)` block (before its closing `});`):

```js
  describe('daysSince', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');
    it('counts whole days elapsed', () => {
      expect(FadingPolicy.daysSince('2026-09-23T12:00:00.000Z', now)).toBe(0);
      expect(FadingPolicy.daysSince('2026-09-22T12:00:00.000Z', now)).toBe(1);
      expect(FadingPolicy.daysSince('2026-09-16T12:00:00.000Z', now)).toBe(7);
      expect(FadingPolicy.daysSince('2026-08-24T12:00:00.000Z', now)).toBe(30);
    });
    it('rounds down a partial day, so a student is never decayed early', () => {
      expect(FadingPolicy.daysSince('2026-09-22T13:00:00.000Z', now)).toBe(0);
      expect(FadingPolicy.daysSince('2026-09-21T13:00:00.000Z', now)).toBe(1);
    });
    it('returns 0 for a timestamp in the future (a device clock set wrong)', () => {
      expect(FadingPolicy.daysSince('2026-10-01T12:00:00.000Z', now)).toBe(0);
    });
    it('returns 0 for anything it cannot read', () => {
      expect(FadingPolicy.daysSince(undefined, now)).toBe(0);
      expect(FadingPolicy.daysSince(null, now)).toBe(0);
      expect(FadingPolicy.daysSince('', now)).toBe(0);
      expect(FadingPolicy.daysSince('not a date', now)).toBe(0);
      expect(FadingPolicy.daysSince(1758628800000, now)).toBe(0);
      expect(FadingPolicy.daysSince({}, now)).toBe(0);
    });
  });

  describe('computeFadeLevel time decay', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');
    // An entry whose last attempt was `d` days before `now`, with one clean success.
    const ago = (d) => new Date(now.getTime() - d * 86400000).toISOString();
    const clean = { correct: 2, assisted: 0 };

    it('leaves the grace period untouched', () => {
      expect(FadingPolicy.computeFadeLevel(0.94, clean, ago(0), now)).toBe(0.94);
      expect(FadingPolicy.computeFadeLevel(0.94, clean, ago(7), now)).toBe(0.94);
    });
    it('loses exactly one step on the first day past grace', () => {
      expect(FadingPolicy.computeFadeLevel(0.94, clean, ago(8), now)).toBeCloseTo(0.92, 10);
    });
    it('walks the approved curve from 0.94', () => {
      const at = (d) => Number(FadingPolicy.computeFadeLevel(0.94, clean, ago(d), now).toFixed(3));
      expect(at(10)).toBe(0.88);
      expect(at(14)).toBe(0.8);
      expect(at(21)).toBe(0.66);
      expect(at(28)).toBe(0.52);
      expect(at(35)).toBe(0.38);
      expect(at(49)).toBe(0.1);
    });
    it('moves through the bands as the absence lengthens', () => {
      const mode = (d) => FadingPolicy.getMode(FadingPolicy.computeFadeLevel(0.94, clean, ago(d), now));
      expect(mode(7)).toBe('withdrawn');
      expect(mode(14)).toBe('withdrawn');
      expect(mode(21)).toBe('delayed');
      expect(mode(35)).toBe('full');
    });
    it('walks the approved curve from 0.727', () => {
      const at = (d) => Number(FadingPolicy.computeFadeLevel(0.727, clean, ago(d), now).toFixed(3));
      expect(at(0)).toBe(0.727);
      expect(at(14)).toBe(0.587);
      expect(at(21)).toBe(0.447);
      expect(at(35)).toBe(0.167);
    });
    it('floors at 0 and never goes below', () => {
      expect(FadingPolicy.computeFadeLevel(0.94, clean, ago(60), now)).toBe(0);
      expect(FadingPolicy.computeFadeLevel(0.94, clean, ago(365), now)).toBe(0);
    });
    it('does not decay on unreadable or future timestamps', () => {
      expect(FadingPolicy.computeFadeLevel(0.94, clean, undefined, now)).toBe(0.94);
      expect(FadingPolicy.computeFadeLevel(0.94, clean, null, now)).toBe(0.94);
      expect(FadingPolicy.computeFadeLevel(0.94, clean, 'not a date', now)).toBe(0.94);
      expect(FadingPolicy.computeFadeLevel(0.94, clean, ago(-30), now)).toBe(0.94);
    });
    it('takes the lower of decay and the unassisted-success cap', () => {
      const allAssisted = { correct: 3, assisted: 3 };
      // Fresh: the cap binds.
      expect(FadingPolicy.computeFadeLevel(0.874, allAssisted, ago(0), now)).toBe(0.799);
      // Rusty: decay has already taken it below the cap.
      expect(Number(FadingPolicy.computeFadeLevel(0.874, allAssisted, ago(21), now).toFixed(3))).toBe(0.594);
    });
    it('keeps its one-argument and two-argument behaviour unchanged', () => {
      expect(FadingPolicy.computeFadeLevel(0.938)).toBe(0.938);
      expect(FadingPolicy.computeFadeLevel(0.938, { correct: 2, assisted: 1 })).toBe(0.938);
      expect(FadingPolicy.computeFadeLevel(0.874, { correct: 3, assisted: 3 })).toBe(0.799);
      expect(FadingPolicy.computeFadeLevel(null)).toBe(0);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fading-policy.test.js`
Expected: FAIL. `FadingPolicy.daysSince` is not a function, and the decay expectations return the undecayed confidence.

- [ ] **Step 3: Add the constants and the helper**

In `public/js/scaffolding-framework.js`, replace the comment block directly above `FadingPolicy: {` (currently lines 203 to 207, the five lines beginning `// ═══ FADING POLICY (spec Section 5) ═══`) with:

```js
  // ═══ FADING POLICY (spec Section 5) ═══
  // fadeLevel is derived from the concept's Mastery Map entry: clamped
  // confidence, reduced by time away from the concept, then held under the
  // withdrawn band while every success so far needed assistance.
  // Three modes: full (< 0.4), delayed (0.4 to 0.8), withdrawn (>= 0.8).
  // Later phases add repetition, tier and override dimensions, weakened and
  // frequency-reduced modes, and per-Support-Kind cardinality.
```

Then, directly after the `UNASSISTED_GATE_CAP: 0.799,` line and its blank line, insert:

```js
    // Time away from a concept brings support back (spec Section 3). A week of
    // grace covers the ordinary rhythm of weekly lessons and long weekends;
    // past that, two points of fade level per day means a half-term break
    // withdraws the harder variant, three weeks returns delayed support, and a
    // summer holiday returns full support.
    DECAY_GRACE_DAYS: 7,
    DECAY_PER_DAY: 0.02,

    // Whole days between an ISO timestamp and now, rounded down. Anything
    // unreadable, and any timestamp in the future (a device clock set wrong),
    // counts as 0: decay must never fire on data it cannot trust, because the
    // failure direction has to leave a student with more support, not less.
    daysSince(timestamp, now) {
      if (typeof timestamp !== 'string' || timestamp.length === 0) return 0;
      const then = new Date(timestamp);
      if (Number.isNaN(then.getTime())) return 0;
      const nowMs = (now instanceof Date && !Number.isNaN(now.getTime()))
        ? now.getTime()
        : Date.now();
      const elapsed = nowMs - then.getTime();
      if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
      return Math.floor(elapsed / 86400000);
    },
```

- [ ] **Step 4: Apply decay inside computeFadeLevel**

Replace the whole `computeFadeLevel` function and the comment above it (currently lines 233 to 247, from `// Map concept mastery confidence to a fade level in [0, 1].` through the closing `},`) with:

```js
    // Map a concept's Mastery Map entry to a fade level in [0, 1].
    // Clamp the confidence, reduce it by time away from the concept, then hold
    // it under the withdrawn band while every success needed assistance,
    // because mastery means unassisted performance (Tabak and Reiser). Both
    // steps only ever reduce the level, so the result is the lower of the two.
    // Called with one or two arguments it behaves exactly as it did before.
    // `now` is for tests; it defaults to the current time.
    computeFadeLevel(confidence, counts, lastAttemptAt, now) {
      if (typeof confidence !== 'number' || Number.isNaN(confidence)) return 0;
      let level = confidence;
      if (level < 0) level = 0;
      if (level > 1) level = 1;

      const days = this.daysSince(lastAttemptAt, now);
      if (days > this.DECAY_GRACE_DAYS) {
        level = level - (days - this.DECAY_GRACE_DAYS) * this.DECAY_PER_DAY;
        if (level < 0) level = 0;
      }

      if (counts !== undefined && !this.hasUnassistedSuccess(counts)) {
        return Math.min(level, this.UNASSISTED_GATE_CAP);
      }
      return level;
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/fading-policy.test.js`
Expected: PASS, 43 tests (30 existing plus 13 new).

Then the whole suite: `npm test`
Expected: 9 files, 163 tests passing.

If a curve value is off, do not change an expected number and do not change a constant. Re-read spec 3.2 and check the arithmetic: the grace period is exclusive, so day 7 loses nothing and day 8 loses exactly one step.

- [ ] **Step 6: Commit**

```bash
git add public/js/scaffolding-framework.js tests/fading-policy.test.js
git commit -F - <<'MSG'
feat(ace): bring support back after time away from a concept

FadingPolicy.computeFadeLevel now takes the concept's last-attempt
timestamp and subtracts 0.02 of fade level per day beyond a 7 day grace
period, floored at 0. Confidence is untouched: time changes how much
help to offer today, not what the student has shown they can do.
Unreadable or future timestamps never decay.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: Wire the client and retire the browser storage

**Files:**
- Modify: `public/index.html` (`aceChooseRoute` near line 4700, the storage helpers near lines 4741 to 4773, `computeAndPersistFadeLevel` near line 4781)

**Interfaces:**
- Consumes (Task 1): `FadingPolicy.computeFadeLevel(confidence, counts, lastAttemptAt)` and the constants.
- Produces: `window.aceCurrentFadeLevel` continues to hold the effective fade level; `fadeStorageKey`, `readFadeLevel`, and `writeFadeLevel` no longer exist.

- [ ] **Step 1: Pass the timestamp and stop writing to browser storage**

In `computeAndPersistFadeLevel(idx)`, replace these four lines:

```js
  const fadeLevel = globalThis.ScaffoldingFramework.FadingPolicy.computeFadeLevel(confidence, entry);
  writeFadeLevel(studentId, conceptKey, fadeLevel);
  window.aceCurrentFadeLevel = fadeLevel;
  console.log('[ACE v3] fade level for', conceptKey, ':', fadeLevel,
```

with:

```js
  // The entry carries three things the policy needs: the confidence, the
  // correct and assisted counts for the unassisted-success gate, and
  // updated_at for time decay. All three come from D1, so a student's fade
  // level follows them across devices.
  const lastAttemptAt = (entry && typeof entry.updated_at === 'string') ? entry.updated_at : null;
  const fadeLevel = globalThis.ScaffoldingFramework.FadingPolicy.computeFadeLevel(
    confidence, entry, lastAttemptAt
  );
  window.aceCurrentFadeLevel = fadeLevel;
  console.log('[ACE v3] fade level for', conceptKey, ':', fadeLevel,
```

Then delete the now-unused `const studentId = ...` line from the same function (it reads `const studentId = (window.currentUser && window.currentUser.id) || 'anon';`) and the comment above `computeAndPersistFadeLevel` that describes persisting, replacing that comment block (currently `// Compute the fade level for a challenge's concept from mastery confidence,` through `// window.currentUser.mastery_state.`) with:

```js
// Compute the fade level for a challenge's concept and expose it as
// window.aceCurrentFadeLevel. Derived on every challenge load from the
// concept's D1 entry, so nothing is stored: confidence, the assisted counts,
// and the last-attempt date are all the policy needs.
// Read-only with respect to mastery: never assigns to masteryState or
// window.currentUser.mastery_state.
```

- [ ] **Step 2: Delete the browser-storage helpers**

Delete the whole block from the comment banner `// ═══ ACE v3.0 FADE STATE PERSISTENCE (Phase 5a) ═══` through the closing `}` of `writeFadeLevel` (currently lines 4741 to 4773). That is the banner, its six comment lines, and the three functions `fadeStorageKey`, `readFadeLevel`, and `writeFadeLevel`.

Verify nothing else referenced them:

```bash
grep -c "fadeStorageKey\|readFadeLevel\|writeFadeLevel\|qs_fade_" public/index.html
```

Expected: `0`.

- [ ] **Step 3: Decide fast-track from the effective fade level**

In `aceChooseRoute(idx)`, replace this block (the comment, the `unassisted` line, and both `if` statements, currently lines 4720 to 4735):

```js
  // Fast-track requires a matching variant for this idx, and the same
  // unassisted-success gate the fade level uses: a student whose successes
  // all needed a hint has not shown they can solve it alone, so the harder
  // variant waits.
  const unassisted = globalThis.ScaffoldingFramework.FadingPolicy.hasUnassistedSuccess(entry);
  if (confidence >= ACE_FASTTRACK_THRESHOLD && fastTrackVariants[idx] && unassisted) {
    fastTrackActive = true;
    console.log('[ACE] Fast-track route chosen for idx', idx,
      'concept:', conceptKey, '| confidence:', confidence);
    return;
  }
  if (confidence >= ACE_FASTTRACK_THRESHOLD && fastTrackVariants[idx] && !unassisted) {
    console.log('[ACE] Fast-track held for idx', idx,
      'concept:', conceptKey, '| confidence:', confidence,
      '| no unassisted success yet');
  }

  console.log('[ACE] Normal route for idx', idx,
    'concept:', conceptKey, '| confidence:', confidence);
}
```

with:

```js
  // Fast-track decides from the same effective fade level that fading uses,
  // not from raw confidence, so a student who is rusty or who has only ever
  // succeeded with help is not handed the harder variant. For a current
  // student with an unassisted success the effective level equals the clamped
  // confidence, so this is the behaviour that already shipped.
  const lastAttemptAt = (typeof entry.updated_at === 'string') ? entry.updated_at : null;
  const effective = globalThis.ScaffoldingFramework.FadingPolicy.computeFadeLevel(
    confidence, entry, lastAttemptAt
  );

  if (effective >= ACE_FASTTRACK_THRESHOLD && fastTrackVariants[idx]) {
    fastTrackActive = true;
    console.log('[ACE] Fast-track route chosen for idx', idx,
      'concept:', conceptKey, '| effective fade level:', effective);
    return;
  }

  console.log('[ACE] Normal route for idx', idx,
    'concept:', conceptKey, '| confidence:', confidence,
    '| effective fade level:', effective);
}
```

- [ ] **Step 4: Verify**

```bash
grep -c "fadeStorageKey\|readFadeLevel\|writeFadeLevel\|qs_fade_" public/index.html   # expect 0
grep -c "hasUnassistedSuccess" public/index.html                                       # expect 0
grep -c "effective fade level" public/index.html                                       # expect 2
grep -c "computeFadeLevel(" public/index.html                                          # expect 2
```

Then extract and syntax-check every inline script:

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

Expected: `inline scripts: 3` and three `OK` lines. Then `npm test`: 163 passing.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -F - <<'MSG'
feat(ace): derive fade level and fast-track from the concept entry

computeAndPersistFadeLevel passes the entry's updated_at so time decay
applies, and aceChooseRoute decides fast-track from the effective fade
level instead of keeping a second copy of the rules. The Phase 5a
browser-storage helpers are deleted: fade level is derived from D1 on
every load, which also means it follows a student across devices.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: Local end to end against a backdated concept

**Files:**
- No source changes expected. If a bug surfaces, fix it in the file that owns it, add a unit test in `tests/fading-policy.test.js` when the policy is at fault, and commit it separately with a message naming the bug and the step that found it.

**Interfaces:**
- Consumes everything from Tasks 1 and 2.
- Produces a written record in the task report of each assertion below with the actual values observed.

- [ ] **Step 1: Prepare the local database**

```bash
export WRANGLER_SEND_METRICS=false
npm run db:migrate:local 2>&1 | tail -2
npx wrangler d1 execute questsim-ace-triangle-types --local --command "INSERT OR IGNORE INTO users (id, email, first_name, last_name, role) VALUES (9003, 'decay@example.com', 'Decay', 'Student', 'student'); INSERT OR REPLACE INTO sessions (id, user_id, expires_at) VALUES ('decay-session', 9003, datetime('now', '+1 day')); DELETE FROM student_profiles WHERE user_id = 9003;" 2>&1 | tail -2
```

Expected: both statements succeed.

- [ ] **Step 2: Seed a mastered concept whose last attempt was 21 days ago**

```bash
export WRANGLER_SEND_METRICS=false
TS=$(node -p "new Date(Date.now()-21*86400000).toISOString()")
npx wrangler d1 execute questsim-ace-triangle-types --local --command "INSERT OR REPLACE INTO student_profiles (user_id, xp, level, tier, streak, mastery_state) VALUES (9003, 60, 1, 'foundation', 0, json('{\"finding_leg\":{\"level\":\"mastery\",\"confidence\":0.94,\"correct\":2,\"total\":2,\"assisted\":0,\"last_activity\":\"ch_athens_extension_waters2\",\"updated_at\":\"$TS\"}}'));" 2>&1 | tail -2
echo "seeded updated_at: $TS"
```

Expected: the statement succeeds and the timestamp is 21 days in the past.

- [ ] **Step 3: Start the local server**

Start this with the Bash tool's background option, not a trailing `&`:

```bash
export WRANGLER_SEND_METRICS=false
npx wrangler pages dev public/ --d1 DB=03d3d8e4-fd55-4913-bb0d-6f0bcd7e6199 --port 8791
```

Then wait for it:

```bash
for i in $(seq 1 30); do curl -s -o /dev/null --max-time 3 http://localhost:8791/ && break; sleep 1; done
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8791/
```

Expected: `200`. If the port is busy, pick another and use it consistently; record which.

- [ ] **Step 4: Confirm the seeded profile is served**

```bash
curl -s -H 'Cookie: qs_session=decay-session' http://localhost:8791/api/student/profile | node -p "const e=JSON.parse(JSON.parse(require('fs').readFileSync(0,'utf8')).profile.mastery_state).finding_leg; 'confidence='+e.confidence+' updated_at='+e.updated_at"
```

Expected: `confidence=0.94` and the timestamp from Step 2.

- [ ] **Step 5: Three weeks away returns delayed support and holds fast-track**

Using the Browser pane tools: open `http://localhost:8791/`, run `document.cookie = 'qs_session=decay-session; path=/'` in the page, reload, then click through Continue the Quest, skip the check-in, open Athens, Continue, and Accept the Challenge.

Expected in the console:

```
[ACE] Normal route for idx 1 concept: finding_leg | confidence: 0.94 | effective fade level: 0.66
[ACE v3] fade level for finding_leg : 0.66 (mode: delayed)
```

The exact fade level may differ in the last decimal if the seeded timestamp crossed a day boundary during the run; anything from 0.64 to 0.68 in delayed mode is correct. What must hold: the route is Normal rather than Fast-track, and the mode is delayed rather than withdrawn.

If the Browser pane tools are unavailable, say so plainly in the report and record Steps 4, 6 and 7 as the evidence.

- [ ] **Step 6: Five weeks away returns full support**

```bash
export WRANGLER_SEND_METRICS=false
TS=$(node -p "new Date(Date.now()-35*86400000).toISOString()")
npx wrangler d1 execute questsim-ace-triangle-types --local --command "UPDATE student_profiles SET mastery_state = json('{\"finding_leg\":{\"level\":\"mastery\",\"confidence\":0.94,\"correct\":2,\"total\":2,\"assisted\":0,\"last_activity\":\"ch_athens_extension_waters2\",\"updated_at\":\"$TS\"}}') WHERE user_id = 9003;" 2>&1 | tail -2
```

Reload the page and open Athens again.

Expected: `fade level for finding_leg : 0.38 (mode: full)` (0.36 to 0.40 is correct), and the route stays Normal.

- [ ] **Step 7: A current student is unaffected**

```bash
export WRANGLER_SEND_METRICS=false
TS=$(node -p "new Date().toISOString()")
npx wrangler d1 execute questsim-ace-triangle-types --local --command "UPDATE student_profiles SET mastery_state = json('{\"finding_leg\":{\"level\":\"mastery\",\"confidence\":0.94,\"correct\":2,\"total\":2,\"assisted\":0,\"last_activity\":\"ch_athens_extension_waters2\",\"updated_at\":\"$TS\"}}') WHERE user_id = 9003;" 2>&1 | tail -2
```

Reload and open Athens.

Expected: `[ACE] Fast-track route chosen for idx 1 concept: finding_leg | effective fade level: 0.94` and `fade level for finding_leg : 0.94 (mode: withdrawn)`. This is the check that the change is invisible to a student who has been using the site.

- [ ] **Step 8: Nothing was written to browser storage**

In the page console: `Object.keys(localStorage).filter(k => k.startsWith('qs_fade_'))`

Expected: `[]`.

- [ ] **Step 9: Stop the server and record**

Stop the background server. Write every observed value from Steps 4 to 8 into the task report. No commit is expected unless a fix was needed.

---

## Self-review (run by the plan author before handoff)

**Spec coverage:**
- 3.1 constants and 3.2 formula: Task 1 Steps 3 and 4.
- 3.3 both worked tables: Task 1 Step 1 asserts every row of both.
- 3.4 reasoning: captured in the code comment in Task 1 Step 3.
- 3.5 confidence never modified: no task writes to `mastery_state`; Task 3 Step 4 reads it back unchanged after the browser runs.
- 4 ordering against the unassisted gate: Task 1 Step 4 implements clamp, decay, cap in that order, and Step 1 tests both bindings.
- 5 unifying the fast-track gate: Task 2 Step 3, verified by Task 3 Steps 5 and 7.
- 6 where the date comes from: Task 2 Step 1.
- 7 what gets deleted: Task 2 Step 2, verified by grep and by Task 3 Step 8.
- 8 error handling: Task 1 Step 1 covers missing, null, empty, unparseable, non-string, and future timestamps, plus the round-down rule.
- 9 testing: Tasks 1 and 3.
- 10 out of scope: nothing in any task touches D1 schema, history, the other fade modes, or the dashboard.

**Placeholder scan:** none. Every code step carries the code.

**Type consistency:** `daysSince(timestamp, now)` is defined in Task 1 Step 3 and used in Task 1 Step 4. `computeFadeLevel(confidence, counts, lastAttemptAt, now)` is defined in Task 1 Step 4 and called with three arguments in Task 2 Steps 1 and 3, which is valid because `now` is optional. `DECAY_GRACE_DAYS` and `DECAY_PER_DAY` are read through `this` inside the policy object, matching how `UNASSISTED_GATE_CAP` is already read. Test counts are cumulative: 30 existing in this file plus 13 new is 43, and 150 plus 13 is 163.
