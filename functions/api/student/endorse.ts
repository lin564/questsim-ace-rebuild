// POST /api/student/endorse
//
// Second half of the Maya pipeline. Records which rule the student
// endorsed for their just-placed tile, computes whether the rule is
// aligned with the actual category's defining feature, and (on
// misalignment) generates the LLM redirect line.
//
// Body:
//   {
//     placement_event_id: number,
//     endorsed_rule: string
//   }
//
// Returns:
//   {
//     alignment_status: 'aligned' | 'misaligned',
//     redirect_line: string | null,        // populated on misalignment
//     defining_feature: string,
//     belief_alignment: number             // updated score, 0..1
//   }

import type { Env, DataContext } from '../../types';
import { recomputeSignals, lookupRuleAlignment } from '../../lib/signals';
import { generateRedirect, fallbackRedirect } from '../../lib/redirect';

interface EndorseBody {
  placement_event_id: number;
  endorsed_rule: string;
}

export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  let body: EndorseBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.placement_event_id || !body.endorsed_rule) {
    return Response.json(
      { error: 'placement_event_id and endorsed_rule required' },
      { status: 400 },
    );
  }

  const pe = await db.prepare(`
    SELECT id, student_id, actual_category, placed_as, is_correct
    FROM placement_events
    WHERE id = ? AND student_id = ?
  `).bind(body.placement_event_id, user.id).first<{
    id: number;
    student_id: number;
    actual_category: string;
    placed_as: string;
    is_correct: number;
  }>();

  if (!pe) {
    return Response.json(
      { error: 'placement_event not found for this user' },
      { status: 404 },
    );
  }

  // Compare endorsed rule against the *actual* category's defining
  // feature. Even when the student placed correctly, an endorsement of
  // an aligned-but-superficial rule (e.g. "looks symmetrical" for an
  // equilateral) still counts as misaligned — that's the whole point.
  const lookup = await lookupRuleAlignment(db, pe.actual_category, body.endorsed_rule);
  const aligned = lookup?.aligned ?? false;
  const definingFeature = lookup?.defining_feature ?? '';
  const alignmentStatus = aligned ? 'aligned' : 'misaligned';

  // Generate redirect when belief is misaligned, regardless of whether
  // the placement itself was correct — Maya's case is "right answer,
  // wrong reason" and we want to coach that too.
  let redirectLine: string | null = null;
  if (alignmentStatus === 'misaligned') {
    redirectLine = await generateRedirect(context.env, db, {
      studentName: user.first_name,
      placedAs: pe.placed_as,
      actual: pe.actual_category,
      endorsedRule: body.endorsed_rule,
      actualDefiningFeature: definingFeature,
    });
    if (!redirectLine) {
      redirectLine = fallbackRedirect({
        studentName: user.first_name,
        placedAs: pe.placed_as,
        actual: pe.actual_category,
        endorsedRule: body.endorsed_rule,
        actualDefiningFeature: definingFeature,
      });
    }
  }

  // Persist back onto the placement_event row.
  await db.prepare(`
    UPDATE placement_events
    SET endorsed_rule = ?, alignment_status = ?, redirect_line = ?
    WHERE id = ?
  `).bind(body.endorsed_rule, alignmentStatus, redirectLine, pe.id).run();

  // Refresh belief_alignment for the actual category.
  const signals = await recomputeSignals(db, user.id, pe.actual_category);

  // Analytics breadcrumb.
  await db.prepare(
    'INSERT INTO analytics_events (student_id, event_type, event_data) VALUES (?, ?, ?)',
  ).bind(
    user.id,
    'BELIEF_ENDORSE',
    JSON.stringify({
      placement_event_id: pe.id,
      endorsed_rule: body.endorsed_rule,
      alignment_status: alignmentStatus,
      placed_as: pe.placed_as,
      actual: pe.actual_category,
    }),
  ).run();

  return Response.json({
    alignment_status: alignmentStatus,
    redirect_line: redirectLine,
    defining_feature: definingFeature,
    belief_alignment: signals.belief_alignment,
  });
};
