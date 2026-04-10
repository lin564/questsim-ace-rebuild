// POST /api/admin/clear-demo — remove all demo data
import type { Env, DataContext } from '../../types';

export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const db = context.env.DB;

  // Delete everything tied to demo users (email ending in @questsim.example)
  // Cascade deletes should handle class_students, student_profiles, etc.

  // First get all demo user ids
  const demoUsers = await db.prepare("SELECT id FROM users WHERE email LIKE '%@questsim.example'").all();
  const ids = demoUsers.results.map((r: any) => r.id);

  if (ids.length === 0) {
    return Response.json({ ok: true, message: 'No demo data to clear.' });
  }

  // Delete demo classes (will cascade to class_students)
  await db.prepare(`DELETE FROM classes WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@questsim.example')`).run();

  // Delete challenge attempts, game sessions, analytics for demo students
  await db.prepare(`DELETE FROM challenge_attempts WHERE student_id IN (SELECT id FROM users WHERE email LIKE '%@questsim.example')`).run();
  await db.prepare(`DELETE FROM game_sessions WHERE student_id IN (SELECT id FROM users WHERE email LIKE '%@questsim.example')`).run();
  await db.prepare(`DELETE FROM analytics_events WHERE student_id IN (SELECT id FROM users WHERE email LIKE '%@questsim.example')`).run();

  // Delete the users themselves (cascade to student_profiles, class_students)
  await db.prepare(`DELETE FROM users WHERE email LIKE '%@questsim.example'`).run();

  return Response.json({ ok: true, removed: ids.length });
};
