// GET/POST /api/student/progress — save/retrieve challenge progress
import type { Env, DataContext } from '../../types';

// GET — retrieve full progress state
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

// POST — save a challenge attempt + update profile
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

  // Update student profile
  if (is_correct && xp_awarded > 0) {
    await db.prepare(`
      UPDATE student_profiles
      SET xp = xp + ?, level = MAX(1, (xp + ?) / 100 + 1), updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(xp_awarded, xp_awarded, user.id).run();
  }

  // Update mastery/quest state if provided
  if (body.mastery_state) {
    await db.prepare('UPDATE student_profiles SET mastery_state = ?, updated_at = datetime("now") WHERE user_id = ?')
      .bind(JSON.stringify(body.mastery_state), user.id).run();
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
