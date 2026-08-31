// GET /api/teacher/confusions?class_id=...
//
// Reads from placement_events, joined into the teacher's class roster.
// Returns:
//   - per-student top confusion pairs (placed_as ≠ actual, with belief endorsement)
//   - class-level aggregation, top-N pairs surfacing shared misconceptions
//   - per-student fluency + belief_alignment from learner_signals
//
// This is what feeds the dashboard's "Misconceptions" tile.

import type { Env, DataContext } from '../../types';

interface ConfusionRow {
  student_id: number;
  placed_as: string;
  actual_category: string;
  endorsed_rule: string | null;
  pair_count: number;
  last_seen: string;
}

interface SignalRow {
  user_id: number;
  category: string;
  fluency: number;
  belief_alignment: number;
  attempts_count: number;
  endorsements_count: number;
}

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  const url = new URL(context.request.url);
  const classIdRaw = url.searchParams.get('class_id');
  if (!classIdRaw) {
    return Response.json({ error: 'class_id required' }, { status: 400 });
  }
  const classId = parseInt(classIdRaw, 10);
  if (Number.isNaN(classId)) {
    return Response.json({ error: 'class_id must be numeric' }, { status: 400 });
  }

  // Auth: teacher must own the class (or be admin).
  const klass = await db.prepare(
    'SELECT id, name, class_code, teacher_id FROM classes WHERE id = ?',
  ).bind(classId).first<{ id: number; name: string; class_code: string; teacher_id: number }>();
  if (!klass) return Response.json({ error: 'class not found' }, { status: 404 });
  if (user.role !== 'admin' && klass.teacher_id !== user.id) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const studentRows = await db.prepare(`
    SELECT u.id AS student_id, u.first_name, u.last_name
    FROM class_students cs
    JOIN users u ON cs.student_id = u.id
    WHERE cs.class_id = ? AND cs.is_active = 1
  `).bind(classId).all<{ student_id: number; first_name: string; last_name: string }>();
  const studentIds = studentRows.results.map(s => s.student_id);
  if (studentIds.length === 0) {
    return Response.json({
      class: { id: klass.id, name: klass.name },
      students: [],
      class_aggregation: [],
    });
  }
  const placeholders = studentIds.map(() => '?').join(',');

  // Per-student × pair × endorsed_rule counts (only true confusions —
  // i.e. placed_as ≠ actual_category).
  const confRows = await db.prepare(`
    SELECT student_id, placed_as, actual_category, endorsed_rule,
           COUNT(*) AS pair_count,
           MAX(created_at) AS last_seen
    FROM placement_events
    WHERE student_id IN (${placeholders})
      AND placed_as != actual_category
    GROUP BY student_id, placed_as, actual_category, endorsed_rule
    ORDER BY pair_count DESC, last_seen DESC
  `).bind(...studentIds).all<ConfusionRow>();

  // Per-student × category signals.
  const sigRows = await db.prepare(`
    SELECT user_id, category, fluency, belief_alignment, attempts_count, endorsements_count
    FROM learner_signals
    WHERE user_id IN (${placeholders})
  `).bind(...studentIds).all<SignalRow>();

  // Bucket per student.
  const byStudent = new Map<number, {
    student_id: number;
    name: string;
    confusion_pairs: { placed_as: string; actual: string; endorsed_rule: string | null; count: number; last_seen: string }[];
    signals: { category: string; fluency: number; belief_alignment: number; attempts: number; endorsements: number }[];
  }>();
  for (const s of studentRows.results) {
    byStudent.set(s.student_id, {
      student_id: s.student_id,
      name: `${s.first_name} ${s.last_name}`.trim(),
      confusion_pairs: [],
      signals: [],
    });
  }
  for (const r of confRows.results) {
    byStudent.get(r.student_id)?.confusion_pairs.push({
      placed_as: r.placed_as,
      actual: r.actual_category,
      endorsed_rule: r.endorsed_rule,
      count: r.pair_count,
      last_seen: r.last_seen,
    });
  }
  for (const r of sigRows.results) {
    byStudent.get(r.user_id)?.signals.push({
      category: r.category,
      fluency: r.fluency,
      belief_alignment: r.belief_alignment,
      attempts: r.attempts_count,
      endorsements: r.endorsements_count,
    });
  }

  // Class-level rollup: which (placed_as, actual) pairs are shared
  // across the most students? This is what the dashboard headlines.
  const classAggMap = new Map<string, {
    placed_as: string;
    actual: string;
    students: Set<number>;
    occurrences: number;
    sample_rules: Map<string, number>;
  }>();
  for (const r of confRows.results) {
    const key = `${r.placed_as}|${r.actual_category}`;
    let agg = classAggMap.get(key);
    if (!agg) {
      agg = {
        placed_as: r.placed_as,
        actual: r.actual_category,
        students: new Set(),
        occurrences: 0,
        sample_rules: new Map(),
      };
      classAggMap.set(key, agg);
    }
    agg.students.add(r.student_id);
    agg.occurrences += r.pair_count;
    if (r.endorsed_rule) {
      agg.sample_rules.set(
        r.endorsed_rule,
        (agg.sample_rules.get(r.endorsed_rule) ?? 0) + r.pair_count,
      );
    }
  }
  const classAggregation = Array.from(classAggMap.values())
    .map(a => ({
      placed_as: a.placed_as,
      actual: a.actual,
      affected_students: a.students.size,
      total_occurrences: a.occurrences,
      top_endorsed_rules: Array.from(a.sample_rules.entries())
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([rule, count]) => ({ rule, count })),
    }))
    .sort((x, y) =>
      y.affected_students - x.affected_students ||
      y.total_occurrences - x.total_occurrences,
    );

  return Response.json({
    class: { id: klass.id, name: klass.name },
    students: Array.from(byStudent.values()),
    class_aggregation: classAggregation,
  });
};
