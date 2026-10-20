// GET /api/auth/google-callback — exchange code for tokens, create session
import type { Env, DataContext } from '../../types';

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(context.request.headers.get('Cookie') || '');
  const savedState = cookies['qs_oauth_state'];

  // Validate state
  if (!code || !state || state !== savedState) {
    return new Response('Invalid OAuth state', { status: 400 });
  }

  // Derive the redirect URI from the request's own origin (same as google.ts)
  // so preview deployments match the redirect_uri that started the flow.
  const reqUrl = new URL(context.request.url);
  const redirectUri = `${reqUrl.origin}/api/auth/google-callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: context.env.GOOGLE_CLIENT_ID,
      client_secret: context.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return new Response('Token exchange failed', { status: 500 });
  }

  const tokens: any = await tokenRes.json();

  // Decode the id_token (JWT payload is the middle segment)
  const payload = JSON.parse(atob(tokens.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  const { sub: googleId, email, given_name, family_name, picture } = payload;

  if (!email) {
    return new Response('No email in Google token', { status: 400 });
  }

  const db = context.env.DB;

  // Try to find existing user by google_id, then by email
  let user = await db.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first();

  if (!user) {
    user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (user) {
      // Link Google account to pre-created user (admin/teacher created their email beforehand)
      await db.prepare('UPDATE users SET google_id = ?, avatar_url = ?, last_login_at = datetime("now") WHERE id = ?')
        .bind(googleId, picture, user.id).run();
    }
  } else {
    // Update last login
    await db.prepare('UPDATE users SET avatar_url = ?, last_login_at = datetime("now") WHERE id = ?')
      .bind(picture, user.id).run();
  }

  if (!user) {
    // New user — check if there's an admin yet
    const adminCount = await db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role = "admin"').first<{ cnt: number }>();
    const role = (!adminCount || adminCount.cnt === 0) ? 'admin' : 'student';

    // Create new user
    const result = await db.prepare(`
      INSERT INTO users (email, first_name, last_name, role, google_id, avatar_url, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime("now"))
    `).bind(email, given_name || '', family_name || '', role, googleId, picture).run();

    user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first();

    // If student, create student_profiles row
    if (role === 'student' && user) {
      await db.prepare('INSERT INTO student_profiles (user_id) VALUES (?)').bind(user.id).run();
    }
  }

  if (!user) {
    return new Response('Failed to create user', { status: 500 });
  }

  // Create session
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?)')
    .bind(
      sessionId,
      user.id,
      expiresAt,
      context.request.headers.get('User-Agent') || '',
      context.request.headers.get('CF-Connecting-IP') || ''
    ).run();

  // Determine redirect based on role
  const role = user.role as string;
  const screen = role === 'admin' ? 'screen-user-management'
               : role === 'teacher' ? 'screen-teacher-dashboard'
               : 'screen-student-dashboard';

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${reqUrl.origin}/#${screen}`,
      'Set-Cookie': `qs_session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    },
  });
};
