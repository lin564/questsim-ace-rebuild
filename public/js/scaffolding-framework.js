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

  // Consult method called by Feedback Loop at Step 4 (Narrative Match) and
  // Step 5 (Calibration Check). Also invoked proactively mid-solve.
  // context: { studentId, challengeIdx, phase, performanceEvent?, affect?, mastery? }
  // Returns: array of Scaffold instances (empty in this phase)
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
};
console.log('[ACE v3] ScaffoldingFramework loaded:', globalThis.ScaffoldingFramework.version);
