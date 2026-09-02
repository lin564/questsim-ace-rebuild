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
