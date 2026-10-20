// Student middleware: require any authenticated user
import type { Env, DataContext } from '../../types';

export const onRequest: PagesFunction<Env, any, DataContext> = async (context) => {
  if (!context.data.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return context.next();
};
