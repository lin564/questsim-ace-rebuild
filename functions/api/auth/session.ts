// GET /api/auth/session — return current user from cookie
import type { Env, DataContext } from '../../types';

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  if (context.data.user) {
    return Response.json({
      authenticated: true,
      user: context.data.user,
    });
  }
  return Response.json({ authenticated: false });
};
