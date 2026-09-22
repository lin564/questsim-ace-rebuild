// GET /api/student/profile — own profile + quest state + classes
import type { Env, DataContext } from '../../types';

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  // Get student profile
  const profile = await db.prepare('SELECT * FROM student_profiles WHERE user_id = ?')
    .bind(user.id).first();

  // Get classes this student belongs to
  const classes = await db.prepare(`
    SELECT c.id, c.name, c.class_code, c.pathway, cs.joined_at
    FROM class_students cs JOIN classes c ON cs.class_id = c.id
    WHERE cs.student_id = ? AND cs.is_active = 1 AND c.is_active = 1
  `).bind(user.id).all();

  // Get recent sessions
  const recentSessions = await db.prepare(`
    SELECT * FROM game_sessions WHERE student_id = ?
    ORDER BY started_at DESC LIMIT 5
  `).bind(user.id).all();

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      avatar_url: user.avatar_url,
    },
    profile: profile || { xp: 0, level: 1, tier: 'foundation', streak: 0 },
    classes: classes.results,
    recent_sessions: recentSessions.results,
  });
};
