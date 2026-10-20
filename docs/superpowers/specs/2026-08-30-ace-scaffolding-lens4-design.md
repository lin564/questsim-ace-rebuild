# ACE v3.0 — Scaffolding Framework (Lens 4) — Design Spec

**Status:** Draft, awaiting Linda's review
**Author:** Linda Bernard + Claude (design walkthrough 2026-08-30)
**Version:** v3.0 extension to v2.0 (Unified Architecture)
**Repo home:** `questsim-ace-rebuild/docs/superpowers/specs/`
**Publish target:** `lin564.github.io/questsim-ace-architecture/` as Tab 4 (site update to follow)
**Related:** v2.0 Unified Architecture at https://lin564.github.io/questsim-ace-architecture/
**Grounding paper:** Tabak, I. & Reiser, B. J. (chapter 3, *Scaffolding*), Cambridge Handbook of the Learning Sciences

---

## Executive summary

QuestSim's Adaptive Challenge Engine (ACE) v2.0 already models learner state, three-voice narrative synthesis, and teacher-authored feedback. Its treatment of *scaffolding*, however, is under-specified: the spec uses the word for teacher-UX progressive disclosure, and the shipped code implements a "Scaffold Path" mechanism that routes struggling students to easier-numbers side-quests. Both diverge from scaffolding as defined by the learning sciences (Tabak & Reiser). The paper's argument is emphatic: scaffolding is opposed to task decomposition. True scaffolding keeps learners inside the authentic task and offloads the parts they cannot yet do, with contingent support that fades as competence grows.

ACE v3.0 introduces a **fourth architectural lens: the Scaffolding Framework**. Alongside the existing Three-Voice Model, Five ACE Objects, and Progressive Authoring (renamed from "Scaffolded Authoring"), Lens 4 owns the scaffolding policy layer — the six paper-defined functions as a runtime API, plus Fading Policy, Reflection Prompts, Intervention Policy (productive failure), and a Teacher Live-Assist channel. The five ACE objects stay unchanged in count and structure; they *consult* Lens 4 at defined integration points rather than growing new scaffolding attributes.

The result is a v3.0 that (a) is theoretically grounded in the scaffolding literature with every primitive traceable to a citation, (b) is module-agnostic so future Algebra 1 modules inherit the framework for free, (c) retires the "Scaffold Path" anti-pattern with a migration plan, and (d) preserves continuity with v2.0 — the same three voices, five objects, six-step Feedback Loop sequence, and three progressive-disclosure levels for authoring.

---

## Section 1 — Design principles

The constitution for everything downstream. Every subsequent section must satisfy these. Principles are roughly ordered by centrality — when two collide, the earlier one usually wins.

**1. Preserve authentic tasks.** No easier-numbers side-quests, no substitute simpler challenges. Support the student *inside* the real problem.
*Source:* Tabak & Reiser's central claim — scaffolding is opposed to task decomposition.

**2. Contingent, titrated support.** Scaffolds match the learner's current state (mastery, affect, engagement readiness). Not one-size-fits-all.
*Source:* Vygotsky's ZPD — support must sit in the learner's live zone of proximal development.

**3. Fading is required.** Every scaffold has a fade path. Sustained support without fading produces *hypermediation* (Gutiérrez & Stone, 2002), which stifles development.

**4. Productive failure is first-class.** The framework may decide NOT to intervene when a mistake is likely to produce learning. Errors are not always bugs.
*Source:* Kapur & Bielaczyc, 2012.

**5. Support AND problematize.** Scaffolds also make invisible-but-important aspects visible, not only make things easier.
*Source:* Reiser, 2004.

**6. Distributed across three voices; always synergistic.** Every scaffold traces to inputs from System, Teacher, or Student. The three-voice synthesis composes them, not competes them.
*Source:* Puntambekar & Kolodner, 2005.

**7. Teacher is both author AND live collaborator.** The Teacher voice contributes pre-authored rules *and* runtime interventions. Both feed the same synthesis pipeline.
*Source:* Belland 2016 meta-analysis; Martin et al. 2019.

**8. The six functions are design targets, and coverage is auditable.** Every primitive serves at least one function. Every function has at least one primitive serving it.

**9. Module-agnostic by construction.** Lens 4 defines no Pythagoras-specific concepts. Same interface for Linear Equations, Systems, Quadratics — whatever the scheme of work brings.

**10. One meaning per word.** "Scaffolding" refers exclusively to Lens 4's concerns. Pre-existing collisions get renamed. New concepts get names that don't overload existing terms.

---

## Section 2 — Naming and terminology glossary

### Existing terms changing

| Current term | Where it appears | Meaning today | Resolution |
|---|---|---|---|
| **Scaffolding** (generic) | Everywhere | Three different meanings | Reserved for Lens 4's concerns only |
| `Challenge.scaffoldingSet` | v2 spec, Challenge object | Available hints and supports | **Renamed to `challengeSupports`** |
| **Scaffolded Authoring** | v2 spec, Lens 3 tab | Teacher UX progressive disclosure (L1/L2/L3) | **Renamed to Progressive Authoring** |
| **"Scaffold Path"** | Shipped code + game README | Easier-numbers side-quest routing | **Deprecated entirely** — see Section 10 |

### New terms introduced

| New term | What it names | Defined in |
|---|---|---|
| **Scaffolding Framework** | Lens 4 itself | Section 3 |
| **Scaffold** (noun) | A runtime instance of support | Section 3 |
| **Support Kind** | Category of scaffold (Offload / Prompt / Sentence Stem / Hint / Worked-Example Fragment / Problematizing Nudge) | Section 3 |
| **Fading Policy** | Framework-level rules for scaffold withdrawal | Section 5 |
| **Fade State** | Per-student per-concept per-Support-Kind fade level | Section 5 |
| **Reflection Prompt** | Structured prompt for student reasoning | Section 6 |
| **Intervention Policy** | Framework's decide-or-not logic | Section 7 |
| **Live-Assist Event** | Runtime teacher-pushed scaffold event | Section 8 |

### What stays unchanged

- The five ACE objects (Learner Profile, Challenge, Mastery Map, Difficulty Pathway, Feedback Loop) — names unchanged
- Three-Voice Model — unchanged
- Six-step Feedback Loop sequence — unchanged
- Progressive Disclosure Levels (L1 / L2 / L3) — unchanged
- Three authoring approaches (Scenario-First, Teaching-Moment Templates, Watch-Me-Teach) — unchanged
- All non-scaffolding v2 attribute names — unchanged

---

## Section 3 — The Scaffolding Framework (Lens 4)

### What Lens 4 is

A **cross-cutting architectural view**, in the same category as the Three-Voice Model. Not a sixth OOUX object. Not a container for long-term data. It is the *policy layer* the five objects consult when a scaffolding decision needs to be made.

### What Lens 4 owns

- The **vocabulary of scaffolding** — the six functions from Tabak & Reiser, exposed as an API (Section 4)
- **Runtime scaffold selection logic**
- **Fading Policy** (Section 5)
- **Reflection Prompt** primitive and firing schedule (Section 6)
- **Intervention Policy** — productive-failure decisions (Section 7)
- **Live-Assist Event** channel (Section 8)
- **Scaffold decision log** — every decision persisted for audit and coverage tracking

### What Lens 4 does NOT own (god-object discipline)

| Concern | Stays in |
|---|---|
| Per-concept mastery scores + confidence | Mastery Map |
| Per-student Fade State (values) | Mastery Map |
| Per-challenge Bloom classification and difficulty vector | Challenge |
| The `challengeSupports` pool | Challenge |
| Learner affect (`mathConfidence`, `sessionMood`, `engagementReadiness`) | Learner Profile |
| Narrative composition (template population) | Feedback Loop |
| Teacher-authored narrative templates and rules | Feedback Loop (authored via Progressive Authoring) |
| Pathway tier transitions | Difficulty Pathway |
| The six-step Feedback Loop sequence | Feedback Loop |

**Rule:** Lens 4 owns *policy* and *runtime decisions*. The five objects own *state* and *content*.

### The consult relationship

- **Challenge**, during activity → *"Given the student's state and my `challengeSupports`, which scaffolds should activate?"*
- **Feedback Loop**, at Narrative Match step → *"Should I intervene, or is this a productive-failure moment?"*
- **Feedback Loop**, at any moment → *"Is a Reflection Prompt due?"*
- **Mastery Map** → *"Given the updated confidence, how does the Fade State advance?"*
- **Feedback Loop**, at any moment → *"Any pending Live-Assist Events from the teacher?"*

The five objects never call each other for scaffolding; they call Lens 4, which composes.

### Scaffold and Support Kind primitives

**Scaffold (noun)** — a runtime instance the framework has decided to deliver. Fields:
- Support Kind (see below)
- Function(s) served (F1-F6)
- Payload (the actual content, from Teacher-authored template or Live-Assist event)
- Source (System / Teacher-authored / Teacher-live / Student-requested)
- Fade State reference

**Support Kinds** (curriculum-agnostic):
- **Offload** — shift cognitive load (calculator, auto-labeling, unit conversion)
- **Prompt** — strategic reminder ("try analyzing before formula-hunting")
- **Sentence Stem** — reasoning template ("The hypotenuse must be ___ because ___")
- **Hint** — direct guidance ("check which side is opposite the right angle")
- **Worked-Example Fragment** — partial solution demo
- **Problematizing Nudge** — surface a discrepancy (calibration gap fits here)

---

## Section 4 — The six functions as Lens 4's API surface

Two shapes of function:

- **Producers** (F1, F2, F4, F5) — evaluate state, return a Scaffold or nothing
- **Modifiers/Guardrails** (F3, F6) — take existing decisions and tune or veto them

### The API

| Function | Kind | Input | Output | Support Kinds it produces |
|---|---|---|---|---|
| **F1 Simplify** | Producer | current challenge, student mastery + affect | An `Offload` Scaffold or nothing | Offload, Worked-Example Fragment |
| **F2 Strategic help** | Producer | challenge, recent attempt pattern, student state | A `Prompt`, `Hint`, or `Sentence Stem` Scaffold or nothing | Prompt, Hint, Sentence Stem |
| **F3 Offset frustration** | Modifier | any Scaffold about to fire, current affect | Same Scaffold with tone/framing adjusted | (none — modulates others) |
| **F4 Problematize** | Producer | mastery signals, self-report, event | A `Problematizing Nudge` or nothing | Problematizing Nudge |
| **F5 Reflect** | Producer | event, session state, timing mode | A `Reflection Prompt` or nothing | Reflection Prompt |
| **F6 Learning-by-doing** | Guardrail | any proposed Scaffold | Allow / Deny with reason | (none — filters others) |

### Evaluation order at runtime (Step 4 of Feedback Loop)

1. **F4 Problematize** runs first — surface calibration gaps and overlooked features before helping
2. **F2 Strategic help** runs — prefer strategy-level nudges to cognitive-load offloading
3. **F1 Simplify** runs — offload only if needed
4. **F5 Reflect** runs — check for reflection moment
5. **Intervention Policy** decides — fire the surviving Scaffolds, or hold back (productive failure)
6. **F3 Offset frustration** modulates tone on any Scaffold that fires
7. **F6 Learning-by-doing** gates each Scaffold against Principle #1 as a final check

The order is not arbitrary. Problematizing before helping is the paper's argument that scaffolding should surface what learners skip. Strategy before offloading is the "prefer lighter interventions" principle. F3 and F6 late is standard filter-pattern architecture.

---

## Section 5 — Fading Policy

Principle #3 requires every scaffold to have a fade path. Without fading, ACE produces dependent learners.

### Fade State (data)

Lives on Mastery Map, per student × per concept × per Support Kind:

- `currentLevel` — 0.0 to 1.0 (0 = full support, 1 = fully withdrawn)
- `dimensionScores` — signals that drove current level
- `lastUpdated` — timestamp for decay and reset windows
- `overrides` — teacher overrides in force
- `history` — recent transitions

### Fading Policy (Lens 4)

Five dimensions can advance or retreat the Fade Level:

1. **Mastery-driven** — as `confidenceScore` rises, fade advances
2. **Repetition-driven** — after N successful independent attempts, fade advances
3. **Tier-driven** — advancing Foundation → Extension → Mastery accelerates fade for the tier the student left
4. **Decay-driven** — Mastery Map's decay model or repeated errors trigger fade **retreat** (un-fading)
5. **Teacher-override** — direct control from Progressive Authoring

Policy combines these into per-support fade level via a documented weighted curve (weights configurable per module).

### Fade modes

| Fade level | Mode | Behavior |
|---|---|---|
| ~0.0 – 0.2 | Full support | Scaffold fires normally |
| ~0.2 – 0.5 | Weakened | Fires at lower specificity (Hint → Sentence Stem → Prompt) |
| ~0.5 – 0.7 | Delayed | Fires only after student pauses beyond threshold |
| ~0.7 – 0.9 | Frequency-reduced | Fires only occasionally |
| ~0.9 – 1.0 | Withdrawn | Does not fire |

### Bidirectional

Fade retreats (support returns) when:
- Mastery Map's decay signals confidence loss
- Repeated errors on a previously-mastered concept
- Long absence from the concept
- Teacher explicit reset

### Composition with the six functions

Fading applies to producer functions (F1, F2, F4, F5). Each candidate Scaffold checked against Fade State. F3 and F6 always run.

### Teacher overrides

Progressive Authoring gains a fading-control surface (UX out of scope). Teachers can set class-level curves, override individuals, view class distribution, receive alerts on significant fade retreat.

### Worked example

Same Athens-to-Alexandria distance challenge, three students:

- **Student A** (novice, mastery 0.3): Sentence Stem fires immediately, full form. Fade Level ~0.05.
- **Student B** (improving, mastery 0.6): Sentence Stem fires only if pause > 20 seconds. Fade Level ~0.55 (delayed).
- **Student C** (mastered, mastery 0.9): Sentence Stem does not fire. Fade Level ~0.95 (withdrawn).

Two weeks later Student C returns and misses the first challenge. Mastery Map's decay + the wrong-answer trigger Fade Policy to retreat — Sentence Stem returns for the next challenge in delayed mode (Fade Level drops from 0.95 → 0.60).

---

## Section 6 — Reflection Prompts primitive

Paper function #5 (prompt learners to explain and reflect) becomes a first-class primitive with three timing modes and a structured schema.

### ReflectionPrompt schema

```
ReflectionPrompt {
  promptType:        OpenQuestion | SentenceStem | ContrastChoice | Explain
  payload:           text/content (populated from Teacher-authored template)
  responseMode:      Type | Speak | Select | Draw
  depthExpectation:  Light | Medium | Deep
  timing:            MidSolve | PostChallenge | SessionEnd
  fadeState:         per-student, per-reflection-practice level
}
```

### Timing modes

- **Mid-solve** — during a challenge, at high-stakes decision points. Depth: Light. Sentence stem or contrast choice; no long typing.
- **Post-challenge** — after answer submitted, before narrative response. Depth: Medium. Open question or explain-your-reasoning.
- **Session-end** — integrated into existing Session Reflection screen, now framework-driven. Depth: Deep.

### Trigger patterns (F5 Reflect)

- After N successful attempts in a row → Post-challenge, Medium
- After a tier transition → Session-end, Deep
- After a productive-failure moment → Post-challenge, Medium
- Mid-solve pause on high-stakes decision → Mid-solve, Light
- First encounter with a concept → Session-end, Deep

### Composition with the three-voice narrative

- **System** (Lens 4) — detects moment, selects timing and depth, checks Fade State
- **Teacher** — provides template (Progressive Authoring), assigns response modes, sets class-level depth expectations
- **Student** — response becomes a Student-voice input; feeds Learner Profile (`openExpression`, engagement signals); may update Mastery Map (self-report calibration signal)

### Fading for reflection practice

Fade dimension separate from concept mastery. As students demonstrate stronger independent reflection, prompts fade *in scaffolding* (from Sentence Stem → Contrast Choice → Open Question) — not *in frequency*. Frequency stays roughly constant; depth of scaffolding within the prompt fades.

### Response handling

- Free-text → `Learner Profile.openExpression` (teacher-reviewable)
- Sentence-stem completions → parsed for engagement signals; may update `sessionMood` or `engagementScore`
- Contrast choices → calibration signal
- Empty responses → noted; may trigger fade retreat

---

## Section 7 — Intervention Policy (productive failure)

The framework's decide-or-not gate. Runs after producer functions have generated candidate scaffolds but before they fire.

### Productive failure as first-class

Kapur & Bielaczyc (2012): some errors *produce* learning. Intervening too eagerly denies students the struggle that consolidates understanding. Intervention Policy is where this shows up — a positive design choice, not an absence.

### When NOT to intervene

- Affect readiness high (`engagementReadiness = maximum`, `mathConfidence = sunshine`, `sessionMood = positive`)
- Concept at Extension or Mastery tier
- Error is surface (computation slip), not foundational
- Recent success pattern
- Teacher opt-in (class or student in productive-failure mode)

### When TO intervene

- Affect signals distress (`mathConfidence = storm cloud`, `sessionMood = negative`, `engagementReadiness = calm`)
- Error maps to a known prerequisite gap
- Concept at Foundation tier
- Repeated errors on the same sub-step
- Long silence / disengagement
- **Live-Assist Event pending** (teacher already made the judgment — always fires)

### Escalation ladder

Escalates progressively within a single challenge attempt:

1. **Prompt** — nudge only
2. **Sentence Stem** or **Contrast Choice** — structured, requires student reasoning
3. **Hint** — direct guidance
4. **Offload** — framework handles part of the load
5. **Live-Assist notification** — teacher notified via Live-Assist channel

Escalation resets between challenges. New challenges start at whatever Fade State says for that student × concept × Support Kind.

### Teacher-configurable defaults (Progressive Authoring)

- Class-level thresholds (aggressive hold-back vs. always intervene)
- Per-student overrides
- Per-concept overrides (some concepts lock to "always fire on first error")
- Productive-failure mode toggle for discovery-oriented lessons

### Interaction with Fading Policy

Fading = trajectory over sessions. Intervention = per-moment decision. Both compose: Fading determines *what supports are available and at what intensity*; Intervention decides *whether the moment warrants firing any of them*.

### Interaction with F6

Intervention runs before F6. If Intervention approves and a Scaffold is produced, F6 checks against Principle #1. Two independent gates.

### Telemetry (validation)

- Hold-back rate
- Productive-failure success rate (did student self-correct within N attempts?)
- Escalation-exhaustion rate (how often does escalation reach Level 5?)
- **Teacher override rate** — most important calibration signal

---

## Section 8 — Teacher Live-Assist channel

Runtime channel for teachers to push a scaffold event during a live student session. Grounds the paper's *synergistic scaffolding* (Martin et al. 2019, McNeill & Krajcik 2009).

Scope boundary: this section defines the **event and channel protocol**. Teacher-side UX (dashboard, live-session view, notification system) belongs to a future Progressive Authoring redesign.

### LiveAssistEvent object

```
LiveAssistEvent {
  source:               teacher identity + timestamp
  target:               student(s) | class | specific challenge/session
  kind:                 SupportKind
  payload:              content (free text | template reference | hint level)
  urgency:              Immediate | NextNaturalPause | EndOfCurrentChallenge
  fadeStateUpdate:      false (default) | true
  attributionMode:      Visible (name teacher) | Silent (framework voice)
  intent:               optional teacher note (telemetry only, not shown to student)
}
```

### Flow into Lens 4

1. **Event arrives** in Live-Assist queue (Lens 4)
2. **Intervention Policy** — Live-Assist bypasses productive-failure hold-back
3. **F3 Offset frustration** modulates tone
4. **F6 Learning-by-doing** gates against Principle #1 (denies if event would produce substitute simpler task)
5. Surviving event flows to three-voice synthesis

### ZPD guardrail

F6 enforces at runtime that teacher-pushed events do not lower the student's ZPD (i.e., cannot push "here's the answer" or "switch to easier problem"). Teacher gets to overrule strategy (productive failure); teacher does not get to overrule pedagogy (Principle #1).

### Three-voice synthesis

Live-Assist events register as Teacher voice contributions, marked `live` vs `authored`:

- **Teacher-authored** → normal template-driven composition
- **Teacher-live** → adds attribution beat per `attributionMode`:
  - `Visible` — *"Mrs. Bernard noticed you paused. She suggests: try labeling the sides first."*
  - `Silent` — *"Try labeling the sides first."* (framework voice)

### Interaction with Fading Policy

Live-Assist events do **not** automatically update Fade State. `fadeStateUpdate: true` opts in when teacher's judgment is "reset this student's fade curve."

### Telemetry (validation)

- Live-Assist rate per teacher
- Post-event success (did student proceed to correct answer?)
- F6 rejection rate (teacher misunderstanding of framework)
- Correlation with student affect

### Worked example

Student stuck on Athens-to-Alexandria distance, third failed attempt, no productive-failure signal (affect calm, mastery 0.4). Intervention Policy escalated to Hint, still no correction. About to escalate to Offload when teacher, watching class dashboard, pushes:

```
LiveAssistEvent {
  source: mrs.bernard@ultisim.com, 14:32:05
  target: student-42, current challenge
  kind: SentenceStem
  payload: "The distance I'm looking for is the ___ side of the triangle because ___"
  urgency: Immediate
  fadeStateUpdate: false
  attributionMode: Silent
  intent: "student stuck on identifying hypotenuse"
}
```

Framework receives it. Intervention Policy: approved. F3: modulates tone to calm affect. F6: approves (Sentence Stem preserves authentic task). Three-voice composes with silent attribution. Fade State on Sentence Stem unchanged. If student self-corrects, telemetry records success. If not, escalation resumes at Level 4 (Offload).

---

## Section 9 — Integration surface

The section that keeps Lens 4 from becoming a god object.

### Two integration moments

- **Reactive** — during Feedback Loop's 6-step sequence, after a Performance Event
- **Proactive** — mid-solve, without a Performance Event (F5 mid-solve reflection, Live-Assist arrivals, Fade State advances)

### Reactive: Feedback Loop's 6-step sequence with Lens 4 hooks

| Step | Existing behavior | Lens 4 hook |
|---|---|---|
| **1. Performance Event** | Student answers, event captured | *(none)* |
| **2. System Analysis** | Evaluate accuracy, time, error type | *(none)* |
| **3. Affective Query** | Read affect from Learner Profile | *(none)* |
| **4. Narrative Match** | Find teacher's matching rule | **Full Lens 4 orchestration** — producers F1/F2/F4/F5, Intervention Policy, F3/F6 filters; returns 0-N Scaffolds |
| **5. Calibration Check** | Cross-reference self-assessment | **F4 refinement** — returns 0-1 additional Problematizing Nudge if calibration gap warrants |
| **6. Narrative Delivery** | Synthesized feedback delivered | Lens 4's produced Scaffolds flow into three-voice narrative composition |

### Proactive

- **Mid-solve pause detected** → Lens 4 evaluates F5 Reflect (mid-solve prompt?) and F2 Strategic help (proactive nudge?)
- **Live-Assist event arrives** → Lens 4 queues, fires through F3/F6 at next natural pause or immediately per `urgency`
- **Fade State advances** → Lens 4's Fading Policy recomputes Fade Level; no immediate scaffold fire, state update only

### Per-object call map

| Object | Calls Lens 4 for... | Passes | Receives |
|---|---|---|---|
| **Learner Profile** | *(never — input only)* | — | — |
| **Challenge** | Selecting subset of `challengeSupports` to expose | student ID, concept, `challengeSupports` pool | Support Kinds with Fade Levels |
| **Mastery Map** | Fading Policy update on confidence change | student ID, concept, new confidenceScore, decay signals | Updated Fade State (persisted back) |
| **Difficulty Pathway** | Notifying of tier transitions | student ID, concept, from-tier → to-tier | *(no return)* — async |
| **Feedback Loop** (reactive) | Step 4 orchestration + Step 5 refinement + Live-Assist queue check | full performance + affect + mastery context | 0-N Scaffolds |
| **Feedback Loop** (proactive) | Mid-solve reflection check, Live-Assist check | current session context, elapsed time | 0-N Scaffolds |

### State ownership matrix

| Data | Owned by | Consulted by Lens 4? |
|---|---|---|
| Mastery scores + confidence | Mastery Map | Read-only |
| Fade State values | Mastery Map | Read + write (via Fading Policy) |
| Affect signals | Learner Profile | Read-only |
| `challengeSupports` pool | Challenge | Read-only |
| Bloom classification, difficulty vector | Challenge | Read-only |
| Pathway tier + transitions | Difficulty Pathway | Notified only |
| Narrative templates + rules | Feedback Loop / Progressive Authoring | Read-only |
| **Scaffold decisions and outcomes** | **Lens 4** | Owned — persisted |
| **Six-function invocation history** | **Lens 4** | Owned — persisted for coverage audit |
| **Fading Policy configuration** | **Lens 4** | Owned |
| **Intervention Policy configuration** | **Lens 4** | Owned |
| **Live-Assist queue** | **Lens 4** | Owned |
| Session-end reflection responses | Learner Profile (`openExpression`) | Written from F5 |

### Audit and telemetry

Every Lens 4 decision logged with:
- Timestamp, student ID, session ID
- Which functions ran, which fired, which were suppressed
- Intervention Policy decision + rationale signals
- F6 rejections (critical to track)
- Live-Assist events consumed
- Fade State transitions

---

## Section 10 — Deprecating "Scaffold Path" + cross-module check

### Deprecating "Scaffold Path"

The shipped code routes struggling students to easier-numbers side-quests. Violates Principle #1. No new mechanism replaces "route to easier problem" — behaviors redistribute across Lens 4 primitives:

| Old trigger | Old behavior | New v3 response |
|---|---|---|
| Student fails N times | Easier side quest | Intervention Policy escalation within same challenge |
| Confidence drops | Easier side quest | F3 modulates tone; Intervention with sensitive framing; Live-Assist may notify teacher |
| Long pause | Easier side quest | Proactive F2 Strategic help; F5 mid-solve reflection; **same challenge** |
| Teacher "easier mode" opt-in | Permanent routing | Fade Policy override: freeze at Level 0, full support intensity in **same challenge** |

Escalation ladder terminates at Live-Assist notification. System does not silently swap the problem.

### Migration plan (spec-level; implementation plan follows in writing-plans skill)

1. **Freeze** — no new content under Scaffold Path pattern
2. **Audit** — identify all Scaffold Path side-quests in the game (grep code + content)
3. **Map each** — decide per side-quest: **(a) delete**, **(b) retire as route, keep as content**, or **(c) rewrite** into authentic challenge
4. **Deprecate routing code** — remove decision logic from Feedback Loop
5. **Update telemetry** — Scaffold Path events become Intervention Policy escalation events
6. **Changelog** — "Scaffold Path deprecated; replaced by in-place scaffolding via Lens 4"

**Note:** Content-audit work (step 3) is bigger than code-deprecation work (step 4). Each existing side-quest requires a curriculum judgment. That judgment is content work, not framework work — belongs to whoever owns the Pythagoras Quest content.

### Cross-module check — does Lens 4 generalize?

Chosen module: **Linear Equations** (natural post-Pythagoras topic).

| Check | Result |
|---|---|
| Six functions work? | Yes — Simplify (arithmetic offload), Strategic help ("isolate first"), Problematize ("moved x without sign change"), Reflect, Offset frustration, Learning-by-doing all apply |
| Support Kinds work? | Yes — Offload, Prompt, Sentence Stem, Hint, Worked-Example Fragment, Problematizing Nudge all apply |
| Fading Policy works? | Yes — Fade State per student × concept × Support Kind; concepts include `one_variable_equations`, `distributive_property`, etc. |
| Intervention Policy works? | Yes — productive failure applies (algebraic misconceptions often benefit from struggle) |
| Live-Assist works? | Yes — event schema unchanged, payload becomes algebra-appropriate |
| 6-step Feedback Loop works? | Yes, no change |

**What changes per module (all outside Lens 4):**
- Concept graph (Mastery Map)
- Challenge content + difficulty vectors (Challenge)
- Narrative framing, tone, character voices (Feedback Loop templates)
- Difficulty Pathway tiers
- `challengeSupports` pool
- Specific scaffold text content
- Progressive Authoring templates for the module

**What does NOT change:** Anything in Lens 4. New modules inherit the framework for free.

---

## Appendix A — Six-function coverage matrix

Every function has at least one primitive; every primitive traces to at least one function.

| Function | Primary primitives serving it | Section |
|---|---|---|
| **F1 Simplify** | Offload Support Kind; Worked-Example Fragment Support Kind | 3, 4 |
| **F2 Strategic help** | Prompt / Sentence Stem / Hint Support Kinds; F2's producer method | 3, 4 |
| **F3 Offset frustration** | Tone modulation via F3 on any Scaffold; existing v2 affective-aware narrative synthesis | 4 |
| **F4 Problematize** | Problematizing Nudge Support Kind; existing v2 `calibrationGap` (elevated to first-class role); F4's producer method; Step 5 refinement | 3, 4, 9 |
| **F5 Reflect** | Reflection Prompt primitive; three timing modes; existing v2 Session Reflection screen (now framework-driven) | 6 |
| **F6 Learning-by-doing** | F6 guardrail at runtime; Principle #1 as design principle; existing v2 authentic Ancient Greece game shell | 1, 4 |

## Appendix B — Terminology quick reference

For readers who want the vocabulary without full context.

| Term | One-line definition |
|---|---|
| Scaffolding Framework | Lens 4 — the fourth architectural view, owns scaffolding policy |
| Scaffold | A runtime instance of support delivered by the framework |
| Support Kind | Category of scaffold: Offload / Prompt / Sentence Stem / Hint / Worked-Example Fragment / Problematizing Nudge |
| `challengeSupports` | The per-challenge pool of supports the framework can draw from (renamed from `scaffoldingSet`) |
| Fading Policy | Framework-level rules for scaffold withdrawal |
| Fade State | Per-student per-concept per-Support-Kind fade level (persisted on Mastery Map) |
| Reflection Prompt | Structured prompt for student reasoning |
| Intervention Policy | Framework's decide-or-not logic (houses productive-failure decisions) |
| Live-Assist Event | Runtime teacher-pushed scaffold event |
| Progressive Authoring | The teacher-facing L1/L2/L3 progressive-disclosure UX (renamed from "Scaffolded Authoring") |
| Productive failure | Kapur & Bielaczyc 2012 — some errors produce learning; framework may hold back |
| Hypermediation | Gutiérrez & Stone 2002 — too much sustained support stifles development |
| ZPD | Vygotsky's Zone of Proximal Development — tasks achievable with help but not alone |
| Synergistic scaffolding | Different concurrent supports where some help the learner use the other supports (Puntambekar & Kolodner 2005) |

## Appendix C — Open questions and assumptions

Design commitments to validate against real product use. These are places where the spec makes a defensible best-guess but empirical data will refine.

**On fading (Section 5):**
- Five fade modes may need finer or coarser granularity
- Per-Support-Kind Fade State cardinality may prove too expensive at scale; may need per-concept fallback with per-Support-Kind override
- Weights combining the five dimensions into a Fade Level need empirical tuning

**On reflection (Section 6):**
- Three timing modes may need finer granularity
- Whether depth fades vs. frequency fades — my call is depth; may reverse if students find frequent reflection interruptive
- Empty responses triggering fade retreat may over-fire or under-fire

**On intervention (Section 7):**
- Five-level escalation ladder may need adjustment
- Within-challenge escalation may feel jarring; may need cross-challenge escalation option
- Foundation-tier defaults to more intervention; may over-support cautious students
- Signal thresholds (what counts as distress, long silence) need real-user calibration

**On Live-Assist (Section 8):**
- `attributionMode` default (Visible vs Silent) is a classroom-relational judgment
- `urgency: Immediate` may feel jarring; may default to `NextNaturalPause`
- Escalation ladder resumes after Live-Assist (vs. resets) — my call, may prove wrong
- No multi-student Live-Assist in v3 — v4 feature

**On integration (Section 9):**
- 6-step Feedback Loop sequence unchanged; if real use needs earlier Lens 4 signals, add hooks in v3.1
- Proactive invocations async; may need real-time constraints tuning
- All decisions logged; high-volume classes may need sampling
- `Difficulty Pathway → Lens 4` notification is fire-and-forget; may need sync for specific cases

**On deprecation (Section 10):**
- Content-audit work is bigger than framework-code work — belongs to content owner, not framework owner
- Whether each retired side-quest becomes delete / keep-as-standalone / rewrite is per-quest judgment

---

## Change log for v3.0 (summary)

- **Added:** Lens 4 (Scaffolding Framework) as a fourth architectural view
- **Added:** six paper-derived functions as API surface with producer/modifier/guardrail split
- **Added:** Fading Policy with 5 dimensions, 5 modes, bidirectional
- **Added:** Reflection Prompt primitive with 3 timing modes
- **Added:** Intervention Policy (productive failure as first-class)
- **Added:** Teacher Live-Assist channel (event schema + integration; UX deferred)
- **Added:** State ownership matrix and integration surface
- **Renamed:** `Challenge.scaffoldingSet` → `challengeSupports`
- **Renamed:** "Scaffolded Authoring" tab → "Progressive Authoring"
- **Deprecated:** Shipped code's "Scaffold Path" (routing to easier side-quests) — see Section 10 migration
- **Unchanged:** Five ACE objects (count and structure); Three-Voice Model; six-step Feedback Loop sequence; three progressive-disclosure levels; three authoring approaches
