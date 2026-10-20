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
  applyAttempt,
  validateMasteryPayload,
  mergeMasteryPayload,
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
