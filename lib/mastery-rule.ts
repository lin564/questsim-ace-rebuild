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
