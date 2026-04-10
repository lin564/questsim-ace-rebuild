// POST /api/student/join-class — student joins a class by entering a class code
import type { Env, DataContext } from '../../types';

export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const body: any = await context.request.json();
  const { class_code } = body;

  if (!class_code) {
    return Response.json({ error: 'class_code required' }, { status: 400 });
  }

  // Find the class
  const cls = await context.env.DB.prepare('SELECT id, name, teacher_id FROM classes WHERE class_code = ? AND is_active = 1')
    .bind(class_code.toUpperCase()).first<{ id: number, name: string, teacher_id: number }>();

  if (!cls) {
    return Response.json({ error: 'Invalid class code' }, { status: 404 });
  }

  // Check if already in class
  const existing = await context.env.DB.prepare('SELECT id FROM class_students WHERE class_id = ? AND student_id = ?')
    .bind(cls.id, user.id).first();
  if (existing) {
    return Response.json({ ok: true, already_member: true, class: cls });
  }

  // Add student to class
  await context.env.DB.prepare('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)')
    .bind(cls.id, user.id).run();

  // Ensure student_profiles row exists
  await context.env.DB.prepare('INSERT OR IGNORE INTO student_profiles (user_id) VALUES (?)')
    .bind(user.id).run();

  // Log event
  await context.env.DB.prepare('INSERT INTO analytics_events (student_id, class_id, event_type) VALUES (?, ?, ?)')
    .bind(user.id, cls.id, 'class_joined').run();

  return Response.json({ ok: true, class: cls });
};
