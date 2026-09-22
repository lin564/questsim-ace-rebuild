import { describe, it, expect } from 'vitest';
import {
  VOICE_LIMITS,
  GLOBAL_ANON_ACTOR,
  dayKey,
  allowedOrigins,
  isLoopbackHost,
  isAllowedOrigin,
  addressToken,
  actorFor,
  limitFor,
  isOverLimit,
} from '../lib/voice-quota';

describe('VOICE_LIMITS', () => {
  it('gives signed-in callers a generous daily allowance and guests a small one', () => {
    expect(VOICE_LIMITS.signedIn).toBe(50);
    expect(VOICE_LIMITS.anonymous).toBe(10);
    expect(VOICE_LIMITS.anonymousGlobal).toBe(500);
  });
  it('is frozen', () => {
    expect(Object.isFrozen(VOICE_LIMITS)).toBe(true);
  });
});

describe('dayKey', () => {
  it('buckets by UTC calendar day', () => {
    expect(dayKey(new Date('2026-09-22T00:00:00.000Z'))).toBe('2026-09-22');
    expect(dayKey(new Date('2026-09-22T23:59:59.000Z'))).toBe('2026-09-22');
    expect(dayKey(new Date('2026-09-23T00:00:01.000Z'))).toBe('2026-09-23');
  });
  it('accepts an ISO string', () => {
    expect(dayKey('2026-01-05T12:00:00.000Z')).toBe('2026-01-05');
  });
  it('falls back to the epoch day for an unusable input rather than throwing', () => {
    expect(dayKey('not a date')).toBe('1970-01-01');
    expect(dayKey(null)).toBe('1970-01-01');
  });
});

describe('allowedOrigins', () => {
  it('collects the configured app and game origins', () => {
    expect(allowedOrigins({ APP_URL: 'https://app.example', GAME_ORIGIN: 'https://game.example' }))
      .toEqual(['https://app.example', 'https://game.example']);
  });
  it('drops missing entries', () => {
    expect(allowedOrigins({ APP_URL: 'https://app.example' })).toEqual(['https://app.example']);
    expect(allowedOrigins({})).toEqual([]);
  });
});

describe('isLoopbackHost', () => {
  it('recognises local development hosts', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isLoopbackHost('questsim-ace-rebuild.pages.dev')).toBe(false);
    expect(isLoopbackHost('localhost.evil.example')).toBe(false);
    expect(isLoopbackHost(null)).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  const allowed = ['https://questsim-ace-rebuild.pages.dev', 'https://pymini1.questsim.com'];

  it('accepts a configured origin', () => {
    expect(isAllowedOrigin('https://questsim-ace-rebuild.pages.dev', allowed, 'questsim-ace-rebuild.pages.dev')).toBe(true);
    expect(isAllowedOrigin('https://pymini1.questsim.com', allowed, 'questsim-ace-rebuild.pages.dev')).toBe(true);
  });
  it('refuses a missing origin, so a bare script call does not pass', () => {
    expect(isAllowedOrigin(null, allowed, 'questsim-ace-rebuild.pages.dev')).toBe(false);
    expect(isAllowedOrigin(undefined, allowed, 'questsim-ace-rebuild.pages.dev')).toBe(false);
    expect(isAllowedOrigin('', allowed, 'questsim-ace-rebuild.pages.dev')).toBe(false);
  });
  it('refuses an unknown origin', () => {
    expect(isAllowedOrigin('https://evil.example', allowed, 'questsim-ace-rebuild.pages.dev')).toBe(false);
  });
  it('accepts a loopback origin only when the request itself is on loopback', () => {
    expect(isAllowedOrigin('http://localhost:8789', allowed, 'localhost')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:8788', allowed, '127.0.0.1')).toBe(true);
    expect(isAllowedOrigin('http://localhost:8789', allowed, 'questsim-ace-rebuild.pages.dev')).toBe(false);
  });
  it('refuses a malformed origin', () => {
    expect(isAllowedOrigin('localhost', allowed, 'localhost')).toBe(false);
    expect(isAllowedOrigin(42, allowed, 'localhost')).toBe(false);
  });
});

describe('addressToken', () => {
  it('is stable for the same address and secret', () => {
    expect(addressToken('203.0.113.7', 'secret')).toBe(addressToken('203.0.113.7', 'secret'));
  });
  it('differs between addresses and between secrets', () => {
    expect(addressToken('203.0.113.7', 'secret')).not.toBe(addressToken('203.0.113.8', 'secret'));
    expect(addressToken('203.0.113.7', 'secret')).not.toBe(addressToken('203.0.113.7', 'other'));
  });
  it('never returns the address itself', () => {
    const token = addressToken('203.0.113.7', 'secret');
    expect(token).not.toContain('203.0.113.7');
    expect(token).toMatch(/^[0-9a-f]{16}$/);
  });
  it('returns a fixed token when the address is unknown', () => {
    expect(addressToken(null, 'secret')).toBe('unknown');
    expect(addressToken('', 'secret')).toBe('unknown');
  });
});

describe('actorFor', () => {
  it('bills a signed-in caller to their user id', () => {
    expect(actorFor(42, 'abc')).toBe('user:42');
  });
  it('bills an anonymous caller to their address token', () => {
    expect(actorFor(null, 'abc')).toBe('addr:abc');
    expect(actorFor(undefined, 'abc')).toBe('addr:abc');
  });
});

describe('limitFor', () => {
  it('uses the signed-in allowance for a user id', () => {
    expect(limitFor(42)).toBe(VOICE_LIMITS.signedIn);
  });
  it('uses the anonymous allowance otherwise', () => {
    expect(limitFor(null)).toBe(VOICE_LIMITS.anonymous);
    expect(limitFor(undefined)).toBe(VOICE_LIMITS.anonymous);
  });
});

describe('isOverLimit', () => {
  it('is false below the limit and true at or above it', () => {
    expect(isOverLimit(9, 10)).toBe(false);
    expect(isOverLimit(10, 10)).toBe(true);
    expect(isOverLimit(11, 10)).toBe(true);
  });
  it('treats a missing count as zero', () => {
    expect(isOverLimit(null, 10)).toBe(false);
    expect(isOverLimit(undefined, 10)).toBe(false);
  });
});

describe('GLOBAL_ANON_ACTOR', () => {
  it('is a reserved key that no real caller can collide with', () => {
    expect(GLOBAL_ANON_ACTOR).toBe('global:anon');
    expect(actorFor(1, 'abc')).not.toBe(GLOBAL_ANON_ACTOR);
    expect(actorFor(null, 'abc')).not.toBe(GLOBAL_ANON_ACTOR);
  });
});
