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
});
