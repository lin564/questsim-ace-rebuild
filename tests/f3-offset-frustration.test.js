import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F3 Offset frustration modifier', () => {
  let F3, createScaffold;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    F3 = globalThis.ScaffoldingFramework.Functions.F3_offsetFrustration;
    createScaffold = globalThis.ScaffoldingFramework.createScaffold;
  });

  const baseScaffold = () => createScaffold({
    supportKind: 'sentence-stem',
    functions: ['F2'],
    payload: { text: 'The hypotenuse is the ___ side.' }
  });

  it('returns scaffold unchanged when affect is null', () => {
    const s = baseScaffold();
    const out = F3(s, null);
    expect(out.payload.text).toBe('The hypotenuse is the ___ side.');
  });

  it('returns scaffold unchanged when affect is undefined', () => {
    const s = baseScaffold();
    const out = F3(s, undefined);
    expect(out.payload.text).toBe('The hypotenuse is the ___ side.');
  });

  it('returns scaffold unchanged for neutral affect (mathConfidence 3)', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 3, engagementReadiness: 'calm' });
    expect(out.payload.text).toBe('The hypotenuse is the ___ side.');
  });

  it('prepends validating framing when mathConfidence is 1', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 1 });
    expect(out.payload.text).toMatch(/^Math can feel tough sometimes\./);
    expect(out.payload.text).toContain('The hypotenuse is the ___ side.');
  });

  it('prepends validating framing when mathConfidence is 2', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 2 });
    expect(out.payload.text).toMatch(/^Math can feel tough sometimes\./);
  });

  it('does NOT prepend validating framing when mathConfidence is 4', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 4 });
    expect(out.payload.text).not.toMatch(/^Math can feel tough sometimes\./);
  });

  it('prepends twist framing when engagementReadiness is maximum', () => {
    const s = baseScaffold();
    const out = F3(s, { engagementReadiness: 'maximum' });
    expect(out.payload.text).toMatch(/^You came in strong\./);
  });

  it('validating framing wins over twist when both apply', () => {
    const s = baseScaffold();
    const out = F3(s, { mathConfidence: 1, engagementReadiness: 'maximum' });
    expect(out.payload.text).toMatch(/^Math can feel tough sometimes\./);
    expect(out.payload.text).not.toContain('You came in strong');
  });

  it('does not mutate the input scaffold', () => {
    const s = baseScaffold();
    const originalText = s.payload.text;
    F3(s, { mathConfidence: 1 });
    expect(s.payload.text).toBe(originalText);
  });

  it('handles missing payload gracefully (returns scaffold unchanged)', () => {
    const s = createScaffold({ supportKind: 'prompt', functions: ['F2'] });
    // payload defaults to { text: '' }
    const out = F3(s, { mathConfidence: 1 });
    // Empty text still gets prefix; result is just the prefix
    expect(out.payload.text).toMatch(/^Math can feel tough sometimes\./);
  });
});
