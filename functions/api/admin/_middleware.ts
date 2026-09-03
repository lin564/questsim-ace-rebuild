// Admin middleware: require authenticated user with role='admin'
import type { Env, DataContext } from '../../types';

export const onRequest: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user;

  if (!user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (user.role !== 'admin') {
    return Response.json({ error: 'Forbidden: admin access required' }, { status: 403 });
  }

  return context.next();
};
