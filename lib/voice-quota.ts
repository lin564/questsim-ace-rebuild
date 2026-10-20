// Abuse control for the ElevenLabs proxy at POST /api/voice/speak.
//
// The endpoint spends real money per call, so it needs a ceiling even though
// the API key itself is a server secret. Guests in demo mode have no identity,
// so a plain auth gate would take the narration away from exactly the people
// the demo is for. Instead this mirrors the chatbot backend's shape: a
// generous daily allowance for signed-in students, a small one per address for
// guests, and a ceiling on all guest traffic together so rotating addresses
// cannot run the bill up without bound.
//
// Pure module: no Cloudflare, DOM, or Node imports, so the endpoint and vitest
// both import it. Lives outside functions/ because Cloudflare Pages treats
// every file under functions/ as a route.

export const VOICE_LIMITS = Object.freeze({
  signedIn: 50,         // generations per signed-in user per day
  anonymous: 10,        // generations per guest address per day
  anonymousGlobal: 500, // generations for all guests together per day
});

// Reserved actor key for the all-guests counter. The 'global:' prefix cannot
// collide with 'user:' or 'addr:'.
export const GLOBAL_ANON_ACTOR = 'global:anon';

export interface OriginEnv {
  APP_URL?: string;
  GAME_ORIGIN?: string;
}

// Counters bucket by UTC calendar day so the window is the same everywhere.
// An unusable input falls back to the epoch day rather than throwing: a broken
// clock must not turn into an open endpoint.
export function dayKey(now: Date | string | null | undefined): string {
  const d = (now instanceof Date) ? now : new Date(now as string);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return '1970-01-01';
  }
  return d.toISOString().slice(0, 10);
}

export function allowedOrigins(env: OriginEnv): string[] {
  return [env.APP_URL, env.GAME_ORIGIN].filter(
    (o): o is string => typeof o === 'string' && o.length > 0
  );
}

export function isLoopbackHost(host: unknown): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

// The page is the only legitimate caller, and a browser always sends Origin on
// a POST, so a request without one is not the page. A loopback origin passes
// only when the request reached a loopback host too, so forging
// 'Origin: http://localhost' against production does not work.
export function isAllowedOrigin(origin: unknown, allowed: string[], requestHost: unknown): boolean {
  if (typeof origin !== 'string' || origin.length === 0) return false;
  if (allowed.includes(origin)) return true;
  if (!isLoopbackHost(requestHost)) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).hostname;
  } catch (e) {
    return false;
  }
  return isLoopbackHost(originHost);
}

// FNV-1a over the address and a server secret, so the counter table holds an
// opaque token rather than a visitor's address. Not a password hash and not
// meant to be one: it only has to bucket guests without retaining the address.
export function addressToken(address: unknown, secret: unknown): string {
  if (typeof address !== 'string' || address.length === 0) return 'unknown';
  const salted = address + '|' + (typeof secret === 'string' ? secret : '');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < salted.length; i++) {
    const c = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function actorFor(userId: number | null | undefined, token: string): string {
  return (typeof userId === 'number') ? ('user:' + userId) : ('addr:' + token);
}

export function limitFor(userId: number | null | undefined): number {
  return (typeof userId === 'number') ? VOICE_LIMITS.signedIn : VOICE_LIMITS.anonymous;
}

export function isOverLimit(count: number | null | undefined, limit: number): boolean {
  const n = (typeof count === 'number' && Number.isFinite(count)) ? count : 0;
  return n >= limit;
}
