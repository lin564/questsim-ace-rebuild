// GET /api/auth/google — redirect to Google consent screen
import type { Env, DataContext } from '../../types';

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  // Derive the redirect URI from the incoming request's origin so preview
  // deployments (branch builds on Cloudflare Pages) work automatically
  // without needing a per-branch GOOGLE_REDIRECT_URI in wrangler.toml.
  // Falls back to the env var if the request URL can't be parsed.
  const reqUrl = new URL(context.request.url);
  const redirectUri = `${reqUrl.origin}/api/auth/google-callback`;

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: context.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
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
