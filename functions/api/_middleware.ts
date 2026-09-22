// API middleware: CORS headers for game iframe, JSON content type
import type { Env, DataContext } from '../types';

export const onRequest: PagesFunction<Env, any, DataContext> = async (context) => {
  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': context.env.APP_URL || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const response = await context.next();

  // Add CORS and JSON headers
  const origin = context.request.headers.get('Origin');
  const allowed = [context.env.APP_URL, context.env.GAME_ORIGIN].filter(Boolean);
  if (origin && allowed.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
};
