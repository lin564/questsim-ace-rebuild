import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('FadingPolicy', () => {
  let FadingPolicy, createScaffold;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    FadingPolicy = globalThis.ScaffoldingFramework.FadingPolicy;
    createScaffold = globalThis.ScaffoldingFramework.createScaffold;
  });

  const scaffold = () => createScaffold({
    supportKind: 'prompt',
    functions: ['F2'],
    payload: { text: 'a prompt' }
  });

  describe('computeFadeLevel', () => {
    it('returns 0 for null confidence (safe default: full support)', () => {
      expect(FadingPolicy.computeFadeLevel(null)).toBe(0);
    });
    it('returns 0 for undefined confidence', () => {
      expect(FadingPolicy.computeFadeLevel(undefined)).toBe(0);
    });
    it('returns 0 for non-numeric confidence', () => {
      expect(FadingPolicy.computeFadeLevel('high')).toBe(0);
    });
    it('returns confidence unchanged when in [0, 1]', () => {
      expect(FadingPolicy.computeFadeLevel(0.5)).toBe(0.5);
      expect(FadingPolicy.computeFadeLevel(0)).toBe(0);
      expect(FadingPolicy.computeFadeLevel(1)).toBe(1);
    });
    it('clamps confidence above 1 to 1', () => {
      expect(FadingPolicy.computeFadeLevel(1.5)).toBe(1);
    });
    it('clamps confidence below 0 to 0', () => {
      expect(FadingPolicy.computeFadeLevel(-0.3)).toBe(0);
    });
  });

  describe('computeFadeLevel unassisted-success gate', () => {
    it('caps just below withdrawn when every success was assisted', () => {
      expect(FadingPolicy.computeFadeLevel(0.874, { correct: 3, assisted: 3 }))
        .toBe(FadingPolicy.UNASSISTED_GATE_CAP);
      expect(FadingPolicy.getMode(FadingPolicy.computeFadeLevel(0.874, { correct: 3, assisted: 3 })))
        .toBe('delayed');
    });
    it('caps a fully mastered confidence too when no success was unassisted', () => {
      expect(FadingPolicy.computeFadeLevel(0.99, { correct: 5, assisted: 5 })).toBe(0.799);
    });
    it('does not cap once one success was unassisted', () => {
      expect(FadingPolicy.computeFadeLevel(0.938, { correct: 2, assisted: 1 })).toBe(0.938);
      expect(FadingPolicy.getMode(FadingPolicy.computeFadeLevel(0.938, { correct: 2, assisted: 1 })))
        .toBe('withdrawn');
    });
    it('leaves a level below the cap untouched', () => {
      expect(FadingPolicy.computeFadeLevel(0.548, { correct: 1, assisted: 1 })).toBe(0.548);
      expect(FadingPolicy.computeFadeLevel(0.3, { correct: 0, assisted: 0 })).toBe(0.3);
    });
    it('treats a missing assisted count as zero, so a Samos entry is not capped', () => {
      expect(FadingPolicy.computeFadeLevel(0.95, { correct: 4, total: 4 })).toBe(0.95);
    });
    it('caps when counts say successes exist but none were unassisted, by any shape', () => {
      expect(FadingPolicy.computeFadeLevel(0.9, { correct: 1, assisted: 1 })).toBe(0.799);
      expect(FadingPolicy.computeFadeLevel(0.9, { correct: 2, assisted: 4 })).toBe(0.799);
    });
    it('caps when the entry records no success at all', () => {
      expect(FadingPolicy.computeFadeLevel(0.9, { correct: 0, assisted: 0 })).toBe(0.799);
    });
    it('behaves exactly as before when called with one argument', () => {
      expect(FadingPolicy.computeFadeLevel(0.938)).toBe(0.938);
      expect(FadingPolicy.computeFadeLevel(1)).toBe(1);
    });
    it('ignores a non-object or malformed counts argument', () => {
      expect(FadingPolicy.computeFadeLevel(0.938, null)).toBe(0.938);
      expect(FadingPolicy.computeFadeLevel(0.938, 'counts')).toBe(0.938);
      expect(FadingPolicy.computeFadeLevel(0.938, { correct: 'two', assisted: 'one' })).toBe(0.938);
    });
  });

  describe('hasUnassistedSuccess', () => {
    it('is true when at least one success was unassisted', () => {
      expect(FadingPolicy.hasUnassistedSuccess({ correct: 2, assisted: 1 })).toBe(true);
      expect(FadingPolicy.hasUnassistedSuccess({ correct: 1, assisted: 0 })).toBe(true);
      expect(FadingPolicy.hasUnassistedSuccess({ correct: 4 })).toBe(true);
    });
    it('is false when every success was assisted, or there are none', () => {
      expect(FadingPolicy.hasUnassistedSuccess({ correct: 3, assisted: 3 })).toBe(false);
      expect(FadingPolicy.hasUnassistedSuccess({ correct: 0, assisted: 0 })).toBe(false);
    });
    it('is true for a missing or malformed entry, so the gate never blocks on bad data', () => {
      expect(FadingPolicy.hasUnassistedSuccess(null)).toBe(true);
      expect(FadingPolicy.hasUnassistedSuccess(undefined)).toBe(true);
      expect(FadingPolicy.hasUnassistedSuccess('entry')).toBe(true);
      expect(FadingPolicy.hasUnassistedSuccess({ correct: 'two' })).toBe(true);
    });
  });

  describe('getMode', () => {
    it('returns full for fadeLevel < 0.4', () => {
      expect(FadingPolicy.getMode(0)).toBe('full');
      expect(FadingPolicy.getMode(0.39)).toBe('full');
    });
    it('returns delayed for 0.4 <= fadeLevel < 0.8', () => {
      expect(FadingPolicy.getMode(0.4)).toBe('delayed');
      expect(FadingPolicy.getMode(0.6)).toBe('delayed');
      expect(FadingPolicy.getMode(0.79)).toBe('delayed');
    });
    it('returns withdrawn for fadeLevel >= 0.8', () => {
      expect(FadingPolicy.getMode(0.8)).toBe('withdrawn');
      expect(FadingPolicy.getMode(1)).toBe('withdrawn');
    });
    it('treats null/invalid fadeLevel as full', () => {
      expect(FadingPolicy.getMode(null)).toBe('full');
      expect(FadingPolicy.getMode(undefined)).toBe('full');
      expect(FadingPolicy.getMode('x')).toBe('full');
    });
  });

  describe('apply', () => {
    it('returns scaffold in full mode regardless of time', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.1, { timeMs: 500 })).toBe(s);
      expect(FadingPolicy.apply(s, 0.1, { timeMs: 60000 })).toBe(s);
    });
    it('returns null in withdrawn mode regardless of time', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.9, { timeMs: 500 })).toBeNull();
      expect(FadingPolicy.apply(s, 0.9, { timeMs: 60000 })).toBeNull();
    });
    it('returns null in delayed mode when timeMs is below threshold', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.6, { timeMs: 5000 })).toBeNull();
      expect(FadingPolicy.apply(s, 0.6, { timeMs: 19999 })).toBeNull();
    });
    it('returns scaffold in delayed mode when timeMs meets threshold', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.6, { timeMs: 20000 })).toBe(s);
      expect(FadingPolicy.apply(s, 0.6, { timeMs: 60000 })).toBe(s);
    });
    it('returns null in delayed mode when timeMs is missing (cannot confirm pause)', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, 0.6, {})).toBeNull();
      expect(FadingPolicy.apply(s, 0.6, null)).toBeNull();
    });
    it('treats null fadeLevel as full (fires)', () => {
      const s = scaffold();
      expect(FadingPolicy.apply(s, null, { timeMs: 500 })).toBe(s);
    });
    it('returns null for null scaffold', () => {
      expect(FadingPolicy.apply(null, 0.1, { timeMs: 500 })).toBeNull();
    });
    it('exposes DELAY_THRESHOLD_MS as 20000', () => {
      expect(FadingPolicy.DELAY_THRESHOLD_MS).toBe(20000);
    });
  });

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
});
