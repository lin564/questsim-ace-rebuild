import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F1 Simplify producer', () => {
  let F1, createScaffold, SupportKinds;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    F1 = globalThis.ScaffoldingFramework.Functions.F1_simplify;
    createScaffold = globalThis.ScaffoldingFramework.createScaffold;
    SupportKinds = globalThis.ScaffoldingFramework.SupportKinds;
  });

  const offloadSupport = {
    supportKind: 'offload',
    functions: ['F1'],
    payload: { text: 'I will square for you.' }
  };

  it('returns null when no context is given', () => {
    expect(F1(null)).toBeNull();
    expect(F1(undefined)).toBeNull();
  });

  it('returns null when no F1-tagged supports in pool', () => {
    const context = {
      challengeSupports: [{ supportKind: 'prompt', functions: ['F2'], payload: { text: 'nope' } }],
      performanceEvent: { correct: false, attempts: 3, timeMs: 90000 }
    };
    expect(F1(context)).toBeNull();
  });

  it('returns null when no performanceEvent (no signal)', () => {
    const context = { challengeSupports: [offloadSupport] };
    expect(F1(context)).toBeNull();
  });

  it('returns null on first attempt (too early for Simplify)', () => {
    const context = {
      challengeSupports: [offloadSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 90000 }
    };
    expect(F1(context)).toBeNull();
  });

  it('returns null when time on task is below threshold (arithmetic likely not the blocker)', () => {
    const context = {
      challengeSupports: [offloadSupport],
      performanceEvent: { correct: false, attempts: 3, timeMs: 15000 }
    };
    expect(F1(context)).toBeNull();
  });

  it('fires Offload when attempts >= 2 AND time above threshold AND F1-support available', () => {
    const context = {
      challengeSupports: [offloadSupport],
      performanceEvent: { correct: false, attempts: 2, timeMs: 90000 }
    };
    const scaffold = F1(context);
    expect(scaffold).not.toBeNull();
    expect(scaffold.supportKind).toBe('offload');
    expect(scaffold.functions).toContain('F1');
    expect(scaffold.payload.text).toBe('I will square for you.');
  });

  it('prefers Offload over Worked-Example Fragment when both are available', () => {
    const wef = {
      supportKind: 'worked-example-fragment',
      functions: ['F1'],
      payload: { text: 'wef' }
    };
    const context = {
      challengeSupports: [wef, offloadSupport],
      performanceEvent: { correct: false, attempts: 3, timeMs: 90000 }
    };
    const scaffold = F1(context);
    expect(scaffold.supportKind).toBe('offload');
  });
});
