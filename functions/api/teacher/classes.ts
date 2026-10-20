// Teacher classes API: list and create classes
import type { Env, DataContext } from '../../types';

/** Generate a random 6-character uppercase alphanumeric code */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let code = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (const byte of array) {
    code += chars[byte % chars.length];
  }
  return code;
}

/** Generate a unique class code, checking for collisions */
async function generateUniqueCode(db: D1Database, maxAttempts = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateCode();
    const existing = await db.prepare(
      'SELECT id FROM classes WHERE class_code = ?'
    ).bind(code).first();
    if (!existing) return code;
  }
  throw new Error('Failed to generate a unique class code after multiple attempts');
}

// GET: list classes for authenticated teacher (or all if admin)
export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  let classes;
  if (user.role === 'admin') {
    classes = await db.prepare(`
      SELECT c.id, c.name, c.class_code, c.pathway, c.is_active, c.created_at,
             c.teacher_id,
             u.first_name || ' ' || u.last_name AS teacher_name,
             COUNT(cs.id) AS student_count
      FROM classes c
      LEFT JOIN users u ON c.teacher_id = u.id
      LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = 1
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all();
  } else {
    classes = await db.prepare(`
      SELECT c.id, c.name, c.class_code, c.pathway, c.is_active, c.created_at,
             COUNT(cs.id) AS student_count
      FROM classes c
      LEFT JOIN class_students cs ON cs.class_id = c.id AND cs.is_active = 1
      WHERE c.teacher_id = ?
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).bind(user.id).all();
  }

  return Response.json({ classes: classes.results });
};

// POST: create a new class
export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  let body: { name?: string; pathway?: string };
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return Response.json({ error: 'Class name is required' }, { status: 400 });
  }

  let classCode: string;
  try {
    classCode = await generateUniqueCode(db);
  } catch {
    return Response.json(
      { error: 'Unable to generate unique class code. Please try again.' },
      { status: 500 }
    );
  }

  const result = await db.prepare(`
    INSERT INTO classes (teacher_id, name, class_code, pathway, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
  `).bind(user.id, name, classCode, body.pathway || null).run();

  const newClass = await db.prepare(
    'SELECT id, teacher_id, name, class_code, pathway, is_active, created_at FROM classes WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return Response.json({ class: newClass }, { status: 201 });
};
