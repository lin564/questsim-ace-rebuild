// POST /api/auth/logout — clear session
import type { Env, DataContext } from '../../types';

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const cookies = parseCookies(context.request.headers.get('Cookie') || '');
  const sessionId = cookies['qs_session'];

  if (sessionId) {
    await context.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'qs_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    },
  });
};
