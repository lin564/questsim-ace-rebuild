// POST /api/voice/speak — proxy to ElevenLabs TTS
// Body: { text: string, voice?: string }
// Returns: audio/mpeg stream
//
// This endpoint spends money per call, so it is gated twice: the request must
// come from the app's own origin, and every caller has a daily ceiling. See
// lib/voice-quota.ts for the shape and the reasoning. Guests keep narration,
// with a smaller allowance than signed-in students.
import type { Env, DataContext } from '../../types';
import {
  VOICE_LIMITS,
  GLOBAL_ANON_ACTOR,
  dayKey,
  allowedOrigins,
  isAllowedOrigin,
  addressToken,
  actorFor,
  limitFor,
  isOverLimit,
} from '../../../lib/voice-quota';

interface VoiceEnv extends Env {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_PYTHAGORAS?: string;
}

// Read today's counts for the actors this request draws on. Throws on a
// database error so the caller can fail closed: an unreadable ledger must not
// become an unlimited one.
async function readCounts(db: D1Database, day: string, actors: string[]): Promise<Record<string, number>> {
  const placeholders = actors.map(() => '?').join(', ');
  const rows = await db.prepare(
    `SELECT actor, count FROM voice_usage WHERE day = ? AND actor IN (${placeholders})`
  ).bind(day, ...actors).all<{ actor: string; count: number }>();
  const out: Record<string, number> = {};
  for (const row of rows.results || []) {
    out[row.actor] = row.count;
  }
  return out;
}

async function bumpCount(db: D1Database, day: string, actor: string): Promise<void> {
  await db.prepare(`
    INSERT INTO voice_usage (actor, day, count) VALUES (?, ?, 1)
    ON CONFLICT(actor, day) DO UPDATE SET count = count + 1, updated_at = datetime('now')
  `).bind(actor, day).run();
}

export const onRequestPost: PagesFunction<VoiceEnv, any, DataContext> = async (context) => {
  const db = context.env.DB;
  const request = context.request;

  // Gate 1: the page is the only legitimate caller.
  const requestHost = new URL(request.url).hostname;
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin, allowedOrigins(context.env), requestHost)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { text, voice } = await request.json() as { text: string; voice?: string };

  if (!text || text.length > 2000) {
    return Response.json({ error: 'text required (max 2000 chars)' }, { status: 400 });
  }

  const apiKey = context.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
  }

  // Gate 2: daily ceiling. A signed-in student draws on their own allowance;
  // a guest draws on their address allowance and on the all-guests ceiling,
  // so rotating addresses cannot run the bill up without bound.
  const user = context.data.user;
  const userId = user ? user.id : null;
  const address = request.headers.get('CF-Connecting-IP')
    || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
    || null;
  const token = addressToken(address, context.env.JWT_SECRET);
  const actor = actorFor(userId, token);
  const day = dayKey(new Date());
  const actors = userId === null ? [actor, GLOBAL_ANON_ACTOR] : [actor];

  let counts: Record<string, number>;
  try {
    counts = await readCounts(db, day, actors);
  } catch (e: any) {
    console.error('[Voice] quota read failed, refusing:', e && e.message);
    return Response.json({ error: 'Voice temporarily unavailable' }, { status: 503 });
  }

  if (isOverLimit(counts[actor], limitFor(userId))) {
    return Response.json({ error: 'Daily voice limit reached' }, { status: 429 });
  }
  if (userId === null && isOverLimit(counts[GLOBAL_ANON_ACTOR], VOICE_LIMITS.anonymousGlobal)) {
    return Response.json({ error: 'Daily voice limit reached' }, { status: 429 });
  }

  // Default to the Pythagoras voice set in environment; allow override
  const voiceId = voice || context.env.ELEVENLABS_VOICE_PYTHAGORAS || 'ZDi4oaitXxvjeTFrFkh2';

  // Strip HTML and clean up text
  const cleaned = text
    .replace(/<[^>]*>/g, '')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: cleaned,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[ElevenLabs] Error:', res.status, errorText);
    return Response.json({ error: `ElevenLabs error: ${res.status}` }, { status: 502 });
  }

  // Count the generation now that it actually happened, so a rejected or
  // failed call never costs the caller part of their allowance. A counter
  // write that fails is logged and left: one uncounted call is a smaller
  // problem than a dropped response.
  for (const a of actors) {
    try {
      await bumpCount(db, day, a);
    } catch (e: any) {
      console.error('[Voice] quota write failed for', a, e && e.message);
    }
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  });
};
