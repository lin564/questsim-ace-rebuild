// GET /api/admin/users — list all users (admin only)
// POST /api/admin/users — create a new user with any role
import type { Env, DataContext } from '../../types';

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const url = new URL(context.request.url);
  const role = url.searchParams.get('role');

  let query = `
    SELECT id, email, first_name, last_name, role, avatar_url, school_name,
           is_active, created_at, last_login_at
    FROM users
    WHERE is_active = 1
  `;
  const bindings: any[] = [];

  if (role && ['admin', 'teacher', 'student'].includes(role)) {
    query += ' AND role = ?';
    bindings.push(role);
  }

  query += ' ORDER BY created_at DESC';

  const result = await context.env.DB.prepare(query).bind(...bindings).all();
  return Response.json({ users: result.results });
};

export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const body: any = await context.request.json();
  const { email, first_name, last_name, role } = body;

  if (!email || !first_name || !last_name || !role) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['admin', 'teacher', 'student'].includes(role)) {
    return Response.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Check for duplicate email
  const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email).first();
  if (existing) {
    return Response.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Insert user
  const result = await context.env.DB.prepare(`
    INSERT INTO users (email, first_name, last_name, role, school_name)
    VALUES (?, ?, ?, ?, ?)
  `).bind(email, first_name, last_name, role, body.school_name || null).run();

  const userId = result.meta.last_row_id;

  // If student, create student_profiles row
  if (role === 'student') {
    await context.env.DB.prepare('INSERT INTO student_profiles (user_id) VALUES (?)')
      .bind(userId).run();
  }

  const user = await context.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId).first();

  return Response.json({ user }, { status: 201 });
};
