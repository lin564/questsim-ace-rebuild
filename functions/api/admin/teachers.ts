// Admin: manage teacher accounts
import type { Env, DataContext } from '../../types';

// GET /api/admin/teachers — list all teachers
// POST /api/admin/teachers — create a new teacher
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
    SELECT id, email, first_name, last_name, role, google_id, avatar_url,
           school_name, is_active, created_at, last_login_at
    FROM users
    WHERE role = 'teacher'
    ORDER BY created_at DESC
  `).all();

  return Response.json({ teachers: results });
}

async function handlePost(request: Request, env: Env): Promise<Response> {
  let body: { email: string; first_name: string; last_name: string; school_name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, first_name, last_name, school_name } = body;

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

  // Generate a placeholder password (random hex string).
  // In production this would be hashed; the teacher resets on first login via Google OAuth.
  const placeholder = crypto.randomUUID().replace(/-/g, '');

  const result = await env.DB.prepare(`
    INSERT INTO users (email, first_name, last_name, role, school_name, is_active, created_at)
    VALUES (?, ?, ?, 'teacher', ?, 1, datetime('now'))
    RETURNING id, email, first_name, last_name, role, google_id, avatar_url,
              school_name, is_active, created_at, last_login_at
  `).bind(email, first_name, last_name, school_name ?? null).first();

  return Response.json({ teacher: result, temp_password: placeholder }, { status: 201 });
}
