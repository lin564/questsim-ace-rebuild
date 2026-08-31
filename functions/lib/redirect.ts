// LLM redirect-line generation for the Pythagoras character.
//
// Produces a single short spoken line (one or two sentences) that:
//   1. validates the kernel of truth in the student's endorsed rule
//   2. names the actual category's defining feature
//   3. asks an open question about what they see
//
// Cached in `redirect_cache` keyed by (placed_as, actual, rule) so we
// pay the LLM cost once per unique misconception.

import type { Env } from '../types';

const DEFAULT_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are Pythagoras, a warm, patient ancient-Greek mathematician who tutors middle-school geometry students inside a game.
You speak in one or two short sentences, no more than 40 words total.
You always (a) validate something true the student noticed, (b) name the defining feature of the correct category, and (c) end with an open question inviting them to look again.
Never say "wrong" or "incorrect". Address the student by their first name once.
Plain prose only — no markdown, no emoji, no lists.`;

/**
 * Generate (or fetch from cache) a feature-specific redirect line.
 * Returns null if the LLM is not configured AND nothing is cached;
 * the caller should fall back to a templated line.
 */
export async function generateRedirect(
  env: Env,
  db: D1Database,
  args: {
    studentName: string;
    placedAs: string;       // category they dropped into (e.g. "equilateral")
    actual: string;         // correct category (e.g. "isosceles")
    endorsedRule: string;   // what they said they noticed
    actualDefiningFeature: string;
  },
): Promise<string | null> {
  const key = `${args.placedAs}|${args.actual}|${args.endorsedRule.toLowerCase().trim()}`;

  // Cache hit — bump counter and return.
  const cached = await db.prepare('SELECT line FROM redirect_cache WHERE cache_key = ?')
    .bind(key).first<{ line: string }>();
  if (cached) {
    await db.prepare('UPDATE redirect_cache SET hit_count = hit_count + 1 WHERE cache_key = ?')
      .bind(key).run();
    // Personalize the cached line with the current student's name.
    return personalize(cached.line, args.studentName);
  }

  // No LLM configured → caller falls back.
  if (!env.ANTHROPIC_API_KEY) return null;

  const userMsg =
    `A student placed a ${args.actual} triangle into the ${args.placedAs} bin.\n` +
    `They endorsed the rule: "${args.endorsedRule}".\n` +
    `The defining feature of ${args.actual} is: ${args.actualDefiningFeature}.\n` +
    `Speak one short redirect to the student. Use the placeholder {NAME} where their first name should go — do not write the actual name.`;

  const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  let line: string | null = null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 120,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (res.ok) {
      const data = await res.json() as {
        content?: { type: string; text?: string }[];
      };
      const text = data.content?.find(c => c.type === 'text')?.text?.trim();
      if (text) line = text;
    } else {
      console.error('[redirect] Anthropic non-OK:', res.status, await res.text());
    }
  } catch (e) {
    console.error('[redirect] Anthropic fetch failed:', e);
  }

  if (!line) return null;

  // Cache the {NAME}-tokenized version so subsequent students reuse it.
  await db.prepare(
    'INSERT OR IGNORE INTO redirect_cache (cache_key, line) VALUES (?, ?)',
  ).bind(key, line).run();

  return personalize(line, args.studentName);
}

function personalize(line: string, name: string): string {
  return line.replace(/\{NAME\}/g, name);
}

/**
 * Templated fallback when the LLM is unavailable. Deliberately generic
 * so the redirect still names the defining feature.
 */
export function fallbackRedirect(args: {
  studentName: string;
  placedAs: string;
  actual: string;
  endorsedRule: string;
  actualDefiningFeature: string;
}): string {
  return `Good eye for what you noticed there, ${args.studentName}. Look again at this triangle — ${args.actual} asks for ${args.actualDefiningFeature}. What do you see?`;
}
