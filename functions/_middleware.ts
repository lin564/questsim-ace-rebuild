// Global middleware: parse session cookie, attach user to context.data
import type { Env, DataContext } from './types';

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

export const onRequest: PagesFunction<Env, any, DataContext> = async (context) => {
  const cookieHeader = context.request.headers.get('Cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const sessionId = cookies['qs_session'];

  if (sessionId) {
    const row = await context.env.DB.prepare(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role,
             u.google_id, u.avatar_url, u.school_name
      FROM sessions s JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `).bind(sessionId).first();
    context.data = { user: row as any || null };
  } else {
    context.data = { user: null };
  }

  return context.next();
};
