// Teacher middleware: require authenticated user with role='admin' or 'teacher'
import type { Env, DataContext } from '../../types';

export const onRequest: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user;

  if (!user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (user.role !== 'admin' && user.role !== 'teacher') {
    return Response.json({ error: 'Forbidden: teacher or admin access required' }, { status: 403 });
  }

  return context.next();
};
