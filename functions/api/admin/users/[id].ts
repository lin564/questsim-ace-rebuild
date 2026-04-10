// DELETE /api/admin/users/:id — soft-delete a user
import type { Env, DataContext } from '../../../types';

export const onRequestDelete: PagesFunction<Env, any, DataContext> = async (context) => {
  const id = context.params.id;
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  // Don't allow deleting yourself
  if (Number(id) === context.data.user?.id) {
    return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  await context.env.DB.prepare('UPDATE users SET is_active = 0 WHERE id = ?')
    .bind(id).run();

  return Response.json({ ok: true });
};
