// Admin: manage student accounts
import type { Env, DataContext } from '../../types';

// GET /api/admin/students — list all students with their profile data
// POST /api/admin/students — create a new student
export const onRequest: PagesFunction<Env, any, DataContext> = async (context) => {
  const { request, env } = context;

  if (request.method === 'GET') {
    return handleGet(env);
  }

  if (request.method === 'POST') {
    return handlePost(request, env);
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

async function handleGet(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.google_id,
           u.avatar_url, u.school_name, u.is_active, u.created_at, u.last_login_at,
           sp.xp, sp.level, sp.tier, sp.streak, sp.last_session_date,
           sp.quest_state, sp.mastery_state, sp.updated_at AS profile_updated_at
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE u.role = 'student'
    ORDER BY u.created_at DESC
  `).all();

  return Response.json({ students: results });
}

async function handlePost(request: Request, env: Env): Promise<Response> {
  let body: { email: string; first_name: string; last_name: string; class_id?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, first_name, last_name, class_id } = body;

  if (!email || !first_name || !last_name) {
    return Response.json(
      { error: 'Missing required fields: email, first_name, last_name' },
      { status: 400 },
    );
  }

  // Check for existing user with the same email
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?',
  ).bind(email).first();

  if (existing) {
    return Response.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Use a batch to create the user, student profile, and optionally class membership
  // in a single transaction.
  const insertUser = env.DB.prepare(`
    INSERT INTO users (email, first_name, last_name, role, is_active, created_at)
    VALUES (?, ?, ?, 'student', 1, datetime('now'))
  `).bind(email, first_name, last_name);

  // Execute user insert first so we can grab the new id
  const userResult = await insertUser.run();
  const userId = userResult.meta.last_row_id;

  // Build remaining statements
  const statements: D1PreparedStatement[] = [];

  // Create student_profiles row with default values
  statements.push(
    env.DB.prepare(`
      INSERT INTO student_profiles (user_id, xp, level, tier, streak, updated_at)
      VALUES (?, 0, 1, 'bronze', 0, datetime('now'))
    `).bind(userId),
  );

  // If class_id provided, add to class_students
  if (class_id) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO class_students (class_id, student_id, joined_at, is_active)
        VALUES (?, ?, datetime('now'), 1)
      `).bind(class_id, userId),
    );
  }

  await env.DB.batch(statements);

  // Fetch the complete student record to return
  const student = await env.DB.prepare(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.google_id,
           u.avatar_url, u.school_name, u.is_active, u.created_at, u.last_login_at,
           sp.xp, sp.level, sp.tier, sp.streak, sp.last_session_date,
           sp.quest_state, sp.mastery_state, sp.updated_at AS profile_updated_at
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE u.id = ?
  `).bind(userId).first();

  return Response.json({ student }, { status: 201 });
}
