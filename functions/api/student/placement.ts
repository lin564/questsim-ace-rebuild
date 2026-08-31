// POST /api/student/placement
//
// Records one drop-into-bin gesture from the Triangle Types activity.
// This is the first half of the Maya pipeline:
//   pickup → drop  →  THIS ENDPOINT (writes attempt + placement)
//                  →  /api/student/endorse (rule + LLM redirect)
//
// Body:
//   {
//     session_id: number,
//     tile: string,                  // e.g. "isosceles_03"
//     actual_category: string,       // truth from the game
//     placed_as: string,             // bin the student dropped it in
//     dwell_ms?: number,             // pickup → first bin hover (optional)
//     latency_ms?: number,           // pickup → drop
//     challenge_id?: string,         // groups attempts into challenges
//     tier?: string,                 // foundation/extension/mastery
//     location?: string              // game location string for analytics
//   }
//
// Returns:
//   {
//     placement_event_id, attempt_id, is_correct,
//     allowed_rules: [{ rule, aligned }, ...],   // for the chip-picker
//     defining_feature: string                   // shown to teacher only
//   }

import type { Env, DataContext } from '../../types';
import { recomputeSignals } from '../../lib/signals';

interface PlacementBody {
  session_id: number;
  tile: string;
  actual_category: string;
  placed_as: string;
  dwell_ms?: number;
  latency_ms?: number;
  challenge_id?: string;
  tier?: string;
  location?: string;
}

export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  let body: PlacementBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.session_id || !body.tile || !body.actual_category || !body.placed_as) {
    return Response.json(
      { error: 'session_id, tile, actual_category, placed_as required' },
      { status: 400 },
    );
  }

  // Defend against another user's session_id.
  const sess = await db.prepare(
    'SELECT id, student_id FROM game_sessions WHERE id = ? AND student_id = ?',
  ).bind(body.session_id, user.id).first<{ id: number; student_id: number }>();
  if (!sess) {
    return Response.json({ error: 'session not found for this user' }, { status: 404 });
  }

  const isCorrect = body.placed_as === body.actual_category ? 1 : 0;
  const tier = body.tier || 'foundation';
  const challengeId = body.challenge_id || `triangle-types/${body.actual_category}`;
  const location = body.location || 'mini-123';

  // Mirror the placement into challenge_attempts so existing teacher
  // analytics (which read challenge_attempts) keep working unchanged.
  const attemptIns = await db.prepare(`
    INSERT INTO challenge_attempts
      (session_id, student_id, challenge_id, location, tier,
       user_answer, is_correct, time_spent_seconds, xp_awarded)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.session_id,
    user.id,
    challengeId,
    location,
    tier,
    body.placed_as,
    isCorrect,
    body.latency_ms ? Math.round(body.latency_ms / 1000) : null,
    isCorrect ? 10 : 0,
  ).run();
  const attemptId = attemptIns.meta.last_row_id as number;

  // Roll up session counters.
  await db.prepare(`
    UPDATE game_sessions
    SET challenges_attempted = challenges_attempted + 1,
        challenges_correct = challenges_correct + ?,
        xp_earned = xp_earned + ?
    WHERE id = ?
  `).bind(isCorrect, isCorrect ? 10 : 0, body.session_id).run();

  // Award XP on the profile too.
  if (isCorrect) {
    await db.prepare(`
      UPDATE student_profiles
      SET xp = xp + 10, updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(user.id).run();
  }

  // Detailed placement_event row — this is what the adaptive pipeline reads.
  const peIns = await db.prepare(`
    INSERT INTO placement_events
      (attempt_id, session_id, student_id, tile,
       actual_category, placed_as, is_correct,
       dwell_ms, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    attemptId,
    body.session_id,
    user.id,
    body.tile,
    body.actual_category,
    body.placed_as,
    isCorrect,
    body.dwell_ms ?? null,
    body.latency_ms ?? null,
  ).run();
  const placementEventId = peIns.meta.last_row_id as number;

  // Refresh the fluency signal for the *actual* category — this is
  // the one whose mastery this gesture says something about.
  await recomputeSignals(db, user.id, body.actual_category);

  // Pull the allowed_rules so the wrapper can render the chip-picker.
  // We send the rules for the bin the student CHOSE (placed_as), not
  // the actual category, because that's what they're being asked to
  // justify ("you put this in equilateral — why?").
  const ruleRow = await db.prepare(
    'SELECT defining_feature, allowed_rules FROM category_rules WHERE category = ?',
  ).bind(body.placed_as).first<{ defining_feature: string; allowed_rules: string }>();

  let allowedRules: { rule: string; aligned: number }[] = [];
  let definingFeature = '';
  if (ruleRow) {
    definingFeature = ruleRow.defining_feature;
    try { allowedRules = JSON.parse(ruleRow.allowed_rules); } catch { /* ignore */ }
  }

  // Lightweight analytics breadcrumb for the dashboard event stream.
  await db.prepare(
    'INSERT INTO analytics_events (student_id, event_type, event_data) VALUES (?, ?, ?)',
  ).bind(
    user.id,
    'CATEGORY_SELECT',
    JSON.stringify({
      placement_event_id: placementEventId,
      tile: body.tile,
      placed_as: body.placed_as,
      actual: body.actual_category,
      is_correct: isCorrect,
      dwell_ms: body.dwell_ms,
      latency_ms: body.latency_ms,
    }),
  ).run();

  return Response.json({
    placement_event_id: placementEventId,
    attempt_id: attemptId,
    is_correct: isCorrect === 1,
    // Strip `aligned` from what the student sees — they shouldn't
    // know which rule is "right" from the picker alone.
    allowed_rules: allowedRules.map(r => ({ rule: r.rule })),
    defining_feature: definingFeature,
  });
};
