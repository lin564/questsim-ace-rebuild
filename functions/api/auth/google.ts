// GET /api/auth/google — redirect to Google consent screen
import type { Env, DataContext } from '../../types';

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: context.env.GOOGLE_CLIENT_ID,
    redirect_uri: context.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'Set-Cookie': `qs_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`,
    },
  });
};
