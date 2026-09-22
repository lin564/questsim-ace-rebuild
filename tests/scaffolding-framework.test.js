import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ScaffoldingFramework module', () => {
  beforeAll(() => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../public/js/scaffolding-framework.js'),
      'utf8'
    );
    // eslint-disable-next-line no-eval
    eval(source);
  });

  it('exposes globalThis.ScaffoldingFramework', () => {
    expect(globalThis.ScaffoldingFramework).toBeDefined();
  });

  it('has the Phase 1+2 API surface', () => {
    const f = globalThis.ScaffoldingFramework;
    expect(f.version).toBe('v3.0-phase-1');
    expect(typeof f.consult).toBe('function');
    expect(typeof f.createScaffold).toBe('function');
    expect(Object.keys(f.SupportKinds)).toHaveLength(6);
    expect(Object.keys(f.Functions)).toHaveLength(6);
  });

  it('consult returns empty array when no producers wired', () => {
    const result = globalThis.ScaffoldingFramework.consult({});
    expect(Array.isArray(result)).toBe(true);
  });

  it('createScaffold produces expected shape', () => {
    const s = globalThis.ScaffoldingFramework.createScaffold({
      supportKind: 'sentence-stem',
      functions: ['F2'],
      payload: { text: 'test' }
    });
    expect(s.supportKind).toBe('sentence-stem');
    expect(s.functions).toEqual(['F2']);
    expect(s.source).toBe('system');
    expect(s.fadeStateRef).toBeNull();
    expect(typeof s.producedAt).toBe('string');
  });
});
