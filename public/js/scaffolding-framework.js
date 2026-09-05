// ═══ ACE v3.0 SCAFFOLDING FRAMEWORK (LENS 4) ═══
// Extracted to its own module in Phase 3 for testability.
// Spec: docs/superpowers/specs/2026-08-30-ace-scaffolding-lens4-design.md
// Loaded by index.html via <script src="js/scaffolding-framework.js">.
// In Node/jsdom (Vitest), globalThis === global.
//
// Phase 1+2 skeleton. Consult pattern established; policy logic added in later phases.
//
// This module owns runtime scaffolding decisions per the ACE v3 spec. It does
// NOT own per-concept mastery scores (Mastery Map), affect (Learner Profile),
// or the challengeSupports pool per challenge (Challenge). It consults those.
//
// In this phase all six-function stubs return null and consult() returns [].
// Existing v2 behavior via scaffoldActive / fastTrackActive / aceChooseRoute()
// is untouched and will be retired in Phase 9.
globalThis.ScaffoldingFramework = {
  version: 'v3.0-phase-1',
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

  // Six-function API. Producers return a Scaffold or null. Modifiers take
  // a Scaffold and return a (possibly-modified) Scaffold. Guardrails return
  // { allow: bool, reason: string }. Spec Section 4.
  // Phase 1+2: all functions are inert stubs. Real logic added Phase 3+.
  Functions: {
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
    // F4 Problematize (producer). Returns Problematizing Nudge or null.
    F4_problematize(context) {
      return null;
    },
    // F5 Reflect (producer). Returns Reflection Prompt or null.
    F5_reflect(context) {
      return null;
    },
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
  },

  // ═══ FADING POLICY (spec Section 5) ═══
  // Phase 5a: mastery-driven only. fadeLevel = clamped concept confidence.
  // Three modes: full (< 0.4), delayed (0.4 to 0.8), withdrawn (>= 0.8).
  // Later phases add repetition, tier, decay, override dimensions, weakened and
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

  // Consult method called by Feedback Loop at Step 4 (Narrative Match) and
  // Step 5 (Calibration Check). Also invoked proactively mid-solve.
  // context: { studentId, challengeIdx, phase, performanceEvent?, affect?, mastery? }
  // Returns: array of Scaffold instances (empty in this phase)
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
};
console.log('[ACE v3] ScaffoldingFramework loaded:', globalThis.ScaffoldingFramework.version);
