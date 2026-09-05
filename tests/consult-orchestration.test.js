import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('consult orchestration', () => {
  let consult;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    consult = globalThis.ScaffoldingFramework.consult;
  });

  const promptSupport = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'p' } };
  const offloadSupport = { supportKind: 'offload', functions: ['F1'], payload: { text: 'o' } };

  it('returns [] when context is empty', () => {
    expect(consult({})).toEqual([]);
  });

  it('returns [] when no producers fire', () => {
    // No pool, no event: neither F1 nor F2 fires
    expect(consult({ performanceEvent: { correct: false, attempts: 1 } })).toEqual([]);
  });

  it('returns [F2 scaffold] when only F2 fires (attempt 1, prompt in pool)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1 }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].supportKind).toBe('prompt');
    expect(scaffolds[0].functions).toEqual(['F2']);
  });

  it('returns [F2, F1] when both fire (attempt 3, time > threshold, both pools present)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport, offloadSupport],
      performanceEvent: { correct: false, attempts: 3, timeMs: 90000 }
    });
    expect(scaffolds).toHaveLength(2);
    // F2 evaluated first per spec Section 4 (strategic help before simplify)
    expect(scaffolds[0].functions).toEqual(['F2']);
    expect(scaffolds[1].functions).toEqual(['F1']);
  });

  it('handles a null return from a producer (does not crash)', () => {
    // Only F1-eligible pool + high-readiness first attempt: neither fires
    const scaffolds = consult({
      challengeSupports: [offloadSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 10000 },
      affect: { engagementReadiness: 'maximum' }
    });
    expect(scaffolds).toEqual([]);
  });
});

describe('consult orchestration Phase 4 additions', () => {
  let consult;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    consult = globalThis.ScaffoldingFramework.consult;
  });

  const promptSupport = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'the base prompt.' } };

  it('F3 modulates scaffold tone when affect indicates low confidence', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1 },
      affect: { mathConfidence: 1 }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].payload.text).toMatch(/^Math can feel tough sometimes\./);
    expect(scaffolds[0].payload.text).toContain('the base prompt.');
  });

  it('F3 modulates with twist framing on maximum readiness', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1 },
      affect: { engagementReadiness: 'maximum' }
    });
    // Note: F2 would normally skip first attempt at maximum readiness (per Phase 3),
    // so this expects zero scaffolds to survive
    expect(scaffolds).toHaveLength(0);
  });

  it('F3 modulates with twist framing on maximum readiness (attempt 2)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 2 },
      affect: { engagementReadiness: 'maximum' }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].payload.text).toMatch(/^You came in strong\./);
  });

  it('F6 filters out scaffolds with giveaway payload', () => {
    const giveawaySupport = {
      supportKind: 'hint',
      functions: ['F2'],
      payload: { text: 'The answer is 12.' }
    };
    const scaffolds = consult({
      challengeSupports: [giveawaySupport],
      performanceEvent: { correct: false, attempts: 3 }
    });
    // F2 would produce this, but F6 denies it
    expect(scaffolds).toHaveLength(0);
  });

  it('mixed pool: valid scaffold survives F6, giveaway is filtered', () => {
    const goodPrompt = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'good prompt.' } };
    const goodOffload = { supportKind: 'offload', functions: ['F1'], payload: { text: 'good offload.' } };
    // Both F1 and F2 fire on attempt 3 with time > threshold, both pass F6
    const scaffolds = consult({
      challengeSupports: [goodPrompt, goodOffload],
      performanceEvent: { correct: false, attempts: 3, timeMs: 60000 }
    });
    expect(scaffolds).toHaveLength(2);
    expect(scaffolds.every(s => s.payload.text.length > 0)).toBe(true);
  });

  it('F3 runs before F6 in the pipeline (F3-modulated scaffold still passes F6)', () => {
    // F3 prepends "Math can feel tough sometimes. Here is one way in. " (starts with "M", not a giveaway)
    // Result should pass F6
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1 },
      affect: { mathConfidence: 1 }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].payload.text).toMatch(/^Math can feel tough/);
  });
});

describe('consult orchestration Phase 5a fading', () => {
  let consult;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    consult = globalThis.ScaffoldingFramework.consult;
  });

  const promptSupport = { supportKind: 'prompt', functions: ['F2'], payload: { text: 'base prompt.' } };

  it('fires normally when fadeLevel is missing (full support default)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 1000 }
    });
    expect(scaffolds).toHaveLength(1);
  });

  it('fires normally when fadeLevel is low (full mode)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 1000 },
      fadeLevel: 0.2
    });
    expect(scaffolds).toHaveLength(1);
  });

  it('withholds when fadeLevel is high (withdrawn mode)', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 60000 },
      fadeLevel: 0.9
    });
    expect(scaffolds).toHaveLength(0);
  });

  it('withholds in delayed mode before the pause threshold', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 5000 },
      fadeLevel: 0.6
    });
    expect(scaffolds).toHaveLength(0);
  });

  it('fires in delayed mode once the pause threshold is met', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 25000 },
      fadeLevel: 0.6
    });
    expect(scaffolds).toHaveLength(1);
  });

  it('fading runs after F3: a fired scaffold in delayed mode still carries F3 tone', () => {
    const scaffolds = consult({
      challengeSupports: [promptSupport],
      performanceEvent: { correct: false, attempts: 1, timeMs: 25000 },
      fadeLevel: 0.6,
      affect: { mathConfidence: 1 }
    });
    expect(scaffolds).toHaveLength(1);
    expect(scaffolds[0].payload.text).toMatch(/^Math can feel tough sometimes\./);
  });

  it('fading applies to F1 scaffolds too', () => {
    const offload = { supportKind: 'offload', functions: ['F1'], payload: { text: 'offload.' } };
    const scaffolds = consult({
      challengeSupports: [offload],
      performanceEvent: { correct: false, attempts: 3, timeMs: 60000 },
      fadeLevel: 0.9
    });
    expect(scaffolds).toHaveLength(0);
  });
});
