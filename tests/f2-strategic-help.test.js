import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F2 Strategic help producer', () => {
  let F2;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    F2 = globalThis.ScaffoldingFramework.Functions.F2_strategicHelp;
  });

  const promptSupport = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'prompt-text' } };
  const stemSupport = { supportKind: 'sentence-stem', functions: ['F2'], payload: { text: 'stem-text' } };
  const hintSupport = { supportKind: 'hint', functions: ['F2'], payload: { text: 'hint-text' } };
  const fullPool = [promptSupport, stemSupport, hintSupport];

  it('returns null when no context', () => {
    expect(F2(null)).toBeNull();
  });

  it('returns null when no F2-tagged supports', () => {
    const context = {
      challengeSupports: [{ supportKind: 'offload', functions: ['F1'], payload: {} }],
      performanceEvent: { correct: false, attempts: 1 }
    };
    expect(F2(context)).toBeNull();
  });

  it('returns null when no performanceEvent', () => {
    expect(F2({ challengeSupports: fullPool })).toBeNull();
  });

  it('skips first attempt for high-readiness students (protects productive struggle)', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 1 },
      affect: { engagementReadiness: 'maximum' }
    };
    expect(F2(context)).toBeNull();
  });

  it('fires Prompt on attempt 1 for normal-readiness student', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 1 }
    };
    const s = F2(context);
    expect(s).not.toBeNull();
    expect(s.supportKind).toBe('prompt');
  });

  it('fires Sentence Stem on attempt 2', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 2 }
    };
    const s = F2(context);
    expect(s.supportKind).toBe('sentence-stem');
  });

  it('fires Hint on attempt 3', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 3 }
    };
    const s = F2(context);
    expect(s.supportKind).toBe('hint');
  });

  it('falls back when preferred Support Kind not in pool', () => {
    // Attempt 2 prefers Sentence Stem; if only Prompt is available, fall back to Prompt
    const context = {
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 2 }
    };
    const s = F2(context);
    expect(s.supportKind).toBe('prompt');
  });

  it('output Scaffold has functions: [F2]', () => {
    const context = {
      challengeSupports: fullPool,
      performanceEvent: { correct: false, attempts: 1 }
    };
    const s = F2(context);
    expect(s.functions).toEqual(['F2']);
  });
});
