import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F6 Learning-by-doing guardrail', () => {
  let F6, createScaffold;

  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
    F6 = globalThis.ScaffoldingFramework.Functions.F6_learningByDoing;
    createScaffold = globalThis.ScaffoldingFramework.createScaffold;
  });

  const validScaffold = () => createScaffold({
    supportKind: 'sentence-stem',
    functions: ['F2'],
    payload: { text: 'The hypotenuse is the ___ side.' }
  });

  it('rejects null scaffold', () => {
    const r = F6(null);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/scaffold/i);
  });

  it('rejects non-object scaffold', () => {
    expect(F6('a string').allow).toBe(false);
    expect(F6(42).allow).toBe(false);
  });

  it('rejects scaffold with unknown supportKind', () => {
    const s = { supportKind: 'unknown-kind', payload: { text: 'ok' } };
    const r = F6(s);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/supportKind/i);
  });

  it('rejects scaffold with empty payload text', () => {
    const s = { supportKind: 'prompt', payload: { text: '' } };
    const r = F6(s);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/payload/i);
  });

  it('rejects scaffold with missing payload', () => {
    const s = { supportKind: 'prompt' };
    const r = F6(s);
    expect(r.allow).toBe(false);
  });

  it('rejects "The answer is ..." payload', () => {
    const s = { supportKind: 'hint', payload: { text: 'The answer is 12.' } };
    const r = F6(s);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/answer|principle/i);
  });

  it('rejects "The correct answer is ..." payload', () => {
    const s = { supportKind: 'hint', payload: { text: 'The correct answer is 5.' } };
    expect(F6(s).allow).toBe(false);
  });

  it('rejects "Just do ..." payload', () => {
    const s = { supportKind: 'prompt', payload: { text: 'Just do the multiplication.' } };
    expect(F6(s).allow).toBe(false);
  });

  it('rejects "Simply ..." payload', () => {
    const s = { supportKind: 'prompt', payload: { text: 'Simply add the sides.' } };
    expect(F6(s).allow).toBe(false);
  });

  it('rejects "Just use ..." payload', () => {
    const s = { supportKind: 'prompt', payload: { text: 'Just use the calculator.' } };
    expect(F6(s).allow).toBe(false);
  });

  it('is case-insensitive on answer-giveaway detection', () => {
    const s = { supportKind: 'hint', payload: { text: 'THE ANSWER IS 12.' } };
    expect(F6(s).allow).toBe(false);
    const s2 = { supportKind: 'hint', payload: { text: 'the answer is 12.' } };
    expect(F6(s2).allow).toBe(false);
  });

  it('allows a valid Sentence Stem', () => {
    const r = F6(validScaffold());
    expect(r.allow).toBe(true);
  });

  it('allows valid text with "answer" mid-sentence (not giveaway pattern)', () => {
    const s = { supportKind: 'prompt', payload: { text: 'Check your answer against the sides.' } };
    expect(F6(s).allow).toBe(true);
  });
});
