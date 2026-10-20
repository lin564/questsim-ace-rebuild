// GET/POST /api/student/progress: save/retrieve challenge progress
import type { Env, DataContext } from '../../types';
import {
  applyAttempt,
  isAssisted,
  mergeMasteryPayload,
  validateConceptKey,
  validateMasteryPayload,
} from '../../../lib/mastery-rule';
import type { MasteryState } from '../../../lib/mastery-rule';

// Read and parse the student's mastery JSON. Null, empty, or malformed
// becomes an empty object (malformed is logged so it is not silent).
async function readMasteryState(db: D1Database, userId: number): Promise<MasteryState> {
  const row = await db.prepare('SELECT mastery_state FROM student_profiles WHERE user_id = ?')
    .bind(userId).first<{ mastery_state: string | null }>();
  const raw = row?.mastery_state;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as MasteryState : {};
  } catch (e) {
    console.warn('[progress] malformed mastery_state for user', userId, 'treated as empty');
    return {};
  }
}

// GET: retrieve full progress state
export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  const profile = await db.prepare('SELECT * FROM student_profiles WHERE user_id = ?')
    .bind(user.id).first();

  const attempts = await db.prepare(`
    SELECT * FROM challenge_attempts WHERE student_id = ?
    ORDER BY created_at DESC LIMIT 50
  `).bind(user.id).all();

  const sessions = await db.prepare(`
    SELECT * FROM game_sessions WHERE student_id = ?
    ORDER BY started_at DESC LIMIT 10
  `).bind(user.id).all();

  return Response.json({
    profile: profile || { xp: 0, level: 1, tier: 'foundation', streak: 0 },
    recent_attempts: attempts.results,
    recent_sessions: sessions.results,
  });
};

// POST: save a challenge attempt + update profile
export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;
  const body: any = await context.request.json();

  const {
    session_id, challenge_id, location, tier,
    user_answer, is_correct, attempt_number = 1,
    hints_used = 0, time_spent_seconds,
    was_scaffold = false, was_fast_track = false,
    xp_awarded = 0,
  } = body;

  // Mastery inputs are validated here, before the attempt row is inserted,
  // so a rejected request writes nothing (spec 5.3).
  const conceptKey: unknown = body.concept_key;
  const hasConceptKey = conceptKey !== undefined && conceptKey !== null;
  const hasMasteryPayload = body.mastery_state !== undefined && body.mastery_state !== null;
  if (hasConceptKey && hasMasteryPayload) {
    return Response.json({ error: 'send concept_key or mastery_state, not both' }, { status: 400 });
  }
  if (hasConceptKey && !validateConceptKey(conceptKey)) {
    return Response.json({ error: 'invalid concept_key' }, { status: 400 });
  }
  if (hasMasteryPayload) {
    const problem = validateMasteryPayload(body.mastery_state);
    if (problem) return Response.json({ error: problem }, { status: 400 });
  }

  // Ensure a student_profiles row exists for this user before any UPDATE
  // statements below. Admins/teachers playing through in test mode won't
  // have had one seeded, and D1 UPDATEs against a missing row silently
  // affect zero rows, so mastery_state would never be written.
  await db.prepare(
    'INSERT OR IGNORE INTO student_profiles (user_id) VALUES (?)'
  ).bind(user.id).run();

  // Insert challenge attempt
  await db.prepare(`
    INSERT INTO challenge_attempts
    (session_id, student_id, challenge_id, location, tier, user_answer,
     is_correct, attempt_number, hints_used, time_spent_seconds,
     was_scaffold, was_fast_track, xp_awarded)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    session_id, user.id, challenge_id, location, tier, user_answer,
    is_correct ? 1 : 0, attempt_number, hints_used, time_spent_seconds,
    was_scaffold ? 1 : 0, was_fast_track ? 1 : 0, xp_awarded
  ).run();

  // Update game session stats
  if (session_id) {
    const field = is_correct ? 'challenges_correct' : 'challenges_attempted';
    await db.prepare(`
      UPDATE game_sessions
      SET challenges_attempted = challenges_attempted + 1,
          challenges_correct = challenges_correct + ${is_correct ? 1 : 0},
          xp_earned = xp_earned + ?
      WHERE id = ? AND student_id = ?
    `).bind(xp_awarded, session_id, user.id).run();
  }

  // Update student profile. Level is an integer computed as floor(xp/100)+1.
  // CAST forces integer division so 20 XP yields level 1 (not 1.2),
  // 100 XP yields level 2, 250 XP yields level 3, etc.
  if (is_correct && xp_awarded > 0) {
    await db.prepare(`
      UPDATE student_profiles
      SET xp = xp + ?,
          level = MAX(1, CAST((xp + ?) / 100 AS INTEGER) + 1),
          updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(xp_awarded, xp_awarded, user.id).run();
  }

  // Mastery step (spec 5). Two branches, one write:
  //   concept_key present   -> one attempt through the knowledge tracing rule
  //   mastery_state present -> Samos-style object merged per concept key
  // Read-modify-write; a collision between two overlapping requests costs one
  // lost update on one attempt (spec 5.4, accepted).
  if (hasConceptKey || hasMasteryPayload) {
    const current = await readMasteryState(db, user.id);
    const next = hasConceptKey
      ? applyAttempt(current, {
          conceptKey: conceptKey as string,
          correct: !!is_correct,
          assisted: isAssisted({
            attemptNumber: Number(attempt_number),
            hintsUsed: Number(hints_used),
            wasScaffold: !!was_scaffold,
          }),
          source: typeof challenge_id === 'string' ? challenge_id : null,
          now: new Date().toISOString(),
        })
      : mergeMasteryPayload(current, body.mastery_state);
    await db.prepare('UPDATE student_profiles SET mastery_state = ?, updated_at = datetime("now") WHERE user_id = ?')
      .bind(JSON.stringify(next), user.id).run();
  }
  if (body.quest_state) {
    await db.prepare('UPDATE student_profiles SET quest_state = ?, updated_at = datetime("now") WHERE user_id = ?')
      .bind(JSON.stringify(body.quest_state), user.id).run();
  }

  // Log analytics event
  await db.prepare(`
    INSERT INTO analytics_events (student_id, event_type, event_data)
    VALUES (?, ?, ?)
  `).bind(
    user.id,
    is_correct ? 'challenge_correct' : 'challenge_incorrect',
    JSON.stringify({ challenge_id, location, attempt_number, hints_used, xp_awarded })
  ).run();

  // Return updated profile
  const profile = await db.prepare('SELECT * FROM student_profiles WHERE user_id = ?')
    .bind(user.id).first();

  return Response.json({ ok: true, profile });
};
