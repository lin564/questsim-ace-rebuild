# ACE v3 Phase 5c: Time Decay and Un-fading

**Date:** 2026-09-23
**Status:** Design approved in brainstorm (2026-09-23). Next step is the implementation plan.
**Related:** `2026-08-30-ace-scaffolding-lens4-design.md` (Lens 4, Section 5 Fading Policy), `../plans/2026-09-05-ace-v3-phase-5a-fading-policy.md` (Phase 5a), `2026-09-14-ace-mastery-map-write-path-design.md` (the write path that made fading live).

---

## 1. Purpose

Lens 4 Principle #3 requires every scaffold to have a fade path, and the spec names four triggers that should bring support back: confidence loss, repeated errors on a mastered concept, long absence, and a teacher reset. Three of those are either working or out of scope. The fourth has no mechanism at all.

This phase adds it: after a student has been away from a concept long enough, support returns, without touching what the student has shown they can do.

---

## 2. What already works, and why this phase is small

Phase 5c was originally scoped as three pieces: un-fading, fade state stored in D1, and fade history. Re-reading the shipped code against that scope changed the shape of the phase.

**Un-fading on errors is already live.** The fade level is recomputed from mastery confidence on every challenge load, and the knowledge tracing rule drops confidence sharply on a wrong answer. A student at 0.938 with support withdrawn falls to 0.723 after one wrong answer, which is delayed support, and to 0.397 after a second, which is full support. No new code is needed for the error-driven trigger.

**Absence is the real gap.** Confidence never ages. A student who masters the Athens problem in September, leaves for two months, and returns rusty still reads 0.938, so they meet the problem with no support at all.

**Fade state in D1 is not needed.** The fade level is a pure function of data already in D1: the concept's confidence, its `correct` and `assisted` counts, and its `updated_at` timestamp. Storing it would be a denormalised copy with no reader; there is no teacher-facing view of fade state, and the attempts table already records every event a history would summarise. Both are dropped from this phase.

Decision taken in the brainstorm: **time decay only, and delete the unused browser storage.**

---

## 3. The rule

### 3.1 Constants

Two new named constants on `FadingPolicy`, beside the existing `DELAY_THRESHOLD_MS` and `UNASSISTED_GATE_CAP`:

| Name | Value | Meaning |
|------|-------|---------|
| `DECAY_GRACE_DAYS` | 7 | Days of absence that change nothing |
| `DECAY_PER_DAY` | 0.02 | Fade level lost per day of absence beyond the grace period |

The floor is 0, which is full support, the same as a student who has never met the concept.

### 3.2 Formula

With `c` the clamped confidence and `d` whole days since the concept's last attempt:

```
decayed = max(0, c - max(0, d - DECAY_GRACE_DAYS) * DECAY_PER_DAY)
```

### 3.3 Worked examples

A student who left at confidence 0.94 with support withdrawn. Fast-track opens at 0.85; the bands are full below 0.40, delayed from 0.40 to 0.80, withdrawn at 0.80 and above.

| Days away | Fade level | Band | Fast-track |
|---|---|---|---|
| 0 to 7 | 0.94 | withdrawn | open |
| 10 | 0.88 | withdrawn | open |
| 14 | 0.80 | withdrawn | held |
| 21 | 0.66 | delayed | held |
| 28 | 0.52 | delayed | held |
| 35 | 0.38 | full | held |
| 49 | 0.10 | full | held |
| 60 and beyond | 0 | full | held |

A student who left at 0.727, one clean success, already in delayed support:

| Days away | Fade level | Band |
|---|---|---|
| 0 | 0.727 | delayed |
| 14 | 0.587 | delayed |
| 21 | 0.447 | delayed |
| 35 | 0.167 | full |
| 49 and beyond | 0 | full |

### 3.4 Why these numbers

A week of grace means the ordinary rhythm of a weekly lesson never triggers decay, and a long weekend never does. Two weeks, a typical half-term break, withdraws the harder variant but still leaves the student to work unaided. Three weeks returns delayed support. Five to seven weeks, a summer holiday, returns full support. The constants sit in one place and are the tuning surface once real classes produce data.

### 3.5 Confidence is never modified

Decay moves the fade level only. The stored confidence, the level tier, the teacher dashboard, and the ready-for-extension alerts are untouched.

The reason is that the two numbers answer different questions. Confidence answers what the student has shown they can do. Fade level answers how much help to offer today. A class returning from a two week holiday must not find the dashboard reporting that every student's mastery has fallen, and a student must not lose the mastery tier without ever answering a question wrong.

---

## 4. Ordering against the unassisted-success gate

`computeFadeLevel` applies, in order: clamp the confidence into 0 to 1, apply time decay, then apply the unassisted-success cap of 0.799 when the concept has no success without assistance. Both steps only ever reduce the level, so the result is the lower of the two constraints and the order does not change the outcome. Stating it fixes the reading.

---

## 5. Unifying the fast-track gate

Today `aceChooseRoute` decides fast-track from raw confidence against a 0.85 threshold, plus a separate call to `hasUnassistedSuccess`. That is a second copy of rules the fading policy already owns, and it does not know about decay.

This phase points it at the effective fade level instead, the same number fading uses. For a current student with an unassisted success the behaviour is identical, because the effective level equals the clamped confidence. A rusty student, or one whose successes all needed a hint, is handled correctly with no second copy. The duplicate `hasUnassistedSuccess` call in `aceChooseRoute` is removed, along with the log line that reported it separately.

`ACE_FASTTRACK_THRESHOLD` stays at 0.85 and is now compared against the effective level.

---

## 6. Where the date comes from

Every concept entry written by the Mastery Map carries `updated_at`, an ISO timestamp set by the server on each attempt. The client already receives the whole entry, so `computeAndPersistFadeLevel` passes it through and no new storage, request, or schema change is involved. Because the value lives in D1, decay follows a student across devices, which browser storage never could.

---

## 7. What gets deleted

Phase 5a wrote the fade level into browser storage and left `readFadeLevel` with no caller, on the assumption this phase would need the previous value to un-fade from. It does not: absence is measured from the concept entry instead. `fadeStorageKey`, `readFadeLevel`, and `writeFadeLevel` are removed, along with the call in `computeAndPersistFadeLevel`.

Existing `qs_fade_*` keys in a student's browser are left where they are. They are small, harmless, and writing cleanup code for them would cost more than it saves.

---

## 8. Error handling

Decay never fires on data it cannot read. A missing `updated_at`, a value that is not a string, an unparseable date, and a timestamp in the future (a device clock set wrong) all mean zero days elapsed and therefore no decay.

The rationale is that decay is an action taken on evidence of absence, so without trustworthy evidence it takes no action and leaves the level where the student's demonstrated performance put it. Note what that costs, because it is the opposite of the usual safe direction: a higher fade level means less support, so skipping decay leaves a student with less support than decaying would. That is accepted here because the server writes this timestamp on every attempt, which means an unreadable one indicates no recorded attempt rather than a long absence, and inventing an absence from a value we cannot read would be the worse error.

Days are whole days, computed from the difference in milliseconds and rounded down, so a student is never decayed a fraction of a step early.

---

## 9. Testing

**Unit tests** on `FadingPolicy`, in the existing `tests/fading-policy.test.js`:

- Each row of both tables in 3.3, asserting the level and the band.
- The grace boundary: 7 days is untouched, 8 days has lost exactly 0.02.
- The floor: a long absence reaches 0 and never goes below.
- Interaction with the unassisted-success gate: a rusty student whose successes were all assisted gets the lower of the two, and the cap still applies after decay.
- Bad data: `updated_at` missing, null, a non-string, an unparseable string, and a future timestamp, each producing no decay.
- The existing one-argument and two-argument calls keep their current behaviour, so nothing already shipped changes shape.

**Local run** against the local D1: seed a student with a concept entry backdated three weeks, load that challenge, and confirm the console reports the fade level at 0.66 in delayed mode and fast-track held. Then backdate to five weeks and confirm full support.

**Regression:** the 150 existing tests stay green.

---

## 10. Scope boundary and rollout

**Out of scope:** fade state stored in D1, fade history, the weakened and frequency-reduced modes (Phase 5b), per-Support-Kind fade cardinality (Phase 5b), the repetition and tier dimensions (Phase 5b), teacher overrides (Phase 10), and any teacher-facing view of rustiness.

**Rollout:** no schema change, no migration, no new endpoint. Delivery follows the established pattern: implementation plan, subagent-driven development on `claude/kind-solomon-9be8a0`, final review, merge into `claude/integrate-triangle-types-activity-v0P98` with a local merge and push, then a live check.

**First-day effect:** none for anyone who has used the site in the last week. Students returning from a break of more than two weeks will find support where it had been withdrawn. No teacher-visible number changes.

---

## Appendix A: files touched

| File | Change |
|------|--------|
| `public/js/scaffolding-framework.js` | `DECAY_GRACE_DAYS`, `DECAY_PER_DAY`, a days-elapsed helper, and decay inside `computeFadeLevel`. |
| `public/index.html` | `computeAndPersistFadeLevel` passes the entry's `updated_at`; `aceChooseRoute` decides fast-track from the effective fade level; the three browser-storage functions and their call are deleted. |
| `tests/fading-policy.test.js` | Section 9. |
| `docs/superpowers/specs/2026-09-23-ace-phase-5c-time-decay-design.md` | This document. |
