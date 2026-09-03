// GET /api/game/token — issue short-lived JWT for iframe auth
import type { Env, DataContext } from '../../types';

async function signJwt(payload: any, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigStr = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${data}.${sigStr}`;
}

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  if (!context.data.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = context.data.user;
  const token = await signJwt({
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minute expiry
  }, context.env.JWT_SECRET || 'dev-secret');

  return Response.json({ token });
};
