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
