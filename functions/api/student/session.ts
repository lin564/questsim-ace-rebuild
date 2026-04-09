// POST /api/student/session — start/end a game session
import type { Env, DataContext } from '../../types';

export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;
  const body: any = await context.request.json();

  if (body.action === 'start') {
    // Start a new game session
    const profile = await db.prepare('SELECT tier FROM student_profiles WHERE user_id = ?')
      .bind(user.id).first<{ tier: string }>();

    const result = await db.prepare(`
      INSERT INTO game_sessions (student_id, class_id, tier_at_start)
      VALUES (?, ?, ?)
    `).bind(user.id, body.class_id || null, profile?.tier || 'foundation').run();

    // Log analytics
    await db.prepare('INSERT INTO analytics_events (student_id, class_id, event_type) VALUES (?, ?, ?)')
      .bind(user.id, body.class_id || null, 'session_start').run();

    return Response.json({ session_id: result.meta.last_row_id });

  } else if (body.action === 'end') {
    // End an existing session
    const sessionId = body.session_id;
    if (!sessionId) return Response.json({ error: 'session_id required' }, { status: 400 });

    const profile = await db.prepare('SELECT tier FROM student_profiles WHERE user_id = ?')
      .bind(user.id).first<{ tier: string }>();

    await db.prepare(`
      UPDATE game_sessions
      SET ended_at = datetime('now'),
          duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER),
          tier_at_end = ?
      WHERE id = ? AND student_id = ?
    `).bind(profile?.tier || 'foundation', sessionId, user.id).run();

    // Update streak
    await db.prepare(`
      UPDATE student_profiles
      SET streak = streak + 1, last_session_date = date('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(user.id).run();

    // Log analytics
    await db.prepare('INSERT INTO analytics_events (student_id, event_type, event_data) VALUES (?, ?, ?)')
      .bind(user.id, 'session_end', JSON.stringify({ session_id: sessionId })).run();

    return Response.json({ ok: true });

  } else if (body.action === 'checkin') {
    // Save check-in data for a session
    const sessionId = body.session_id;
    if (!sessionId) return Response.json({ error: 'session_id required' }, { status: 400 });

    await db.prepare(`
      UPDATE game_sessions
      SET checkin_mood = ?, checkin_confidence = ?, checkin_goal = ?
      WHERE id = ? AND student_id = ?
    `).bind(body.mood, body.confidence, body.goal, sessionId, user.id).run();

    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
};
