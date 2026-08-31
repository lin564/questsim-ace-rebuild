// Adaptive-pipeline signal computation.
//
// Two scores per (student, category):
//   fluency           = recency-weighted accuracy on placements
//                       (exponential decay, half-life 7 days)
//   belief_alignment  = aligned endorsements / total endorsements
//                       (no decay — beliefs are stickier than skill)
//
// Recomputed after every placement and after every endorsement so the
// next-challenge picker always reads fresh values.

const HALF_LIFE_DAYS = 7;
const LN2 = Math.log(2);

/**
 * Recompute and upsert learner_signals for a single (student, category).
 * Run after any change to placement_events for that student+category.
 */
export async function recomputeSignals(
  db: D1Database,
  studentId: number,
  category: string,
): Promise<{ fluency: number; belief_alignment: number; attempts: number; endorsements: number }> {
  // Pull every placement for this student+category. The rows are small
  // and indexed; for a typical learner this is well under a few hundred.
  const rows = await db.prepare(`
    SELECT is_correct, alignment_status, created_at
    FROM placement_events
    WHERE student_id = ? AND actual_category = ?
  `).bind(studentId, category).all<{
    is_correct: number;
    alignment_status: string | null;
    created_at: string;
  }>();

  const now = Date.now();
  let fluencyNum = 0;
  let fluencyDen = 0;
  let alignedCount = 0;
  let endorsementCount = 0;
  let attemptCount = 0;

  for (const r of rows.results) {
    attemptCount++;
    // Exponential recency weight. created_at is SQLite UTC text.
    const ts = Date.parse(r.created_at + 'Z') || Date.parse(r.created_at);
    const ageDays = (now - ts) / 86_400_000;
    const w = Math.exp(-LN2 * ageDays / HALF_LIFE_DAYS);
    fluencyDen += w;
    if (r.is_correct) fluencyNum += w;

    if (r.alignment_status === 'aligned' || r.alignment_status === 'misaligned') {
      endorsementCount++;
      if (r.alignment_status === 'aligned') alignedCount++;
    }
  }

  const fluency = fluencyDen > 0 ? fluencyNum / fluencyDen : 0;
  const beliefAlignment = endorsementCount > 0 ? alignedCount / endorsementCount : 0;

  await db.prepare(`
    INSERT INTO learner_signals
      (user_id, category, fluency, belief_alignment, attempts_count, endorsements_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, category) DO UPDATE SET
      fluency = excluded.fluency,
      belief_alignment = excluded.belief_alignment,
      attempts_count = excluded.attempts_count,
      endorsements_count = excluded.endorsements_count,
      updated_at = excluded.updated_at
  `).bind(studentId, category, fluency, beliefAlignment, attemptCount, endorsementCount).run();

  return {
    fluency,
    belief_alignment: beliefAlignment,
    attempts: attemptCount,
    endorsements: endorsementCount,
  };
}

/**
 * Look up a category's defining feature and the rule's alignment.
 * Returns null if the category is unknown; returns alignment=null if
 * the rule isn't in the allowed_rules list.
 */
export async function lookupRuleAlignment(
  db: D1Database,
  category: string,
  rule: string,
): Promise<{ defining_feature: string; aligned: boolean | null } | null> {
  const row = await db.prepare(
    'SELECT defining_feature, allowed_rules FROM category_rules WHERE category = ?',
  ).bind(category).first<{ defining_feature: string; allowed_rules: string }>();

  if (!row) return null;

  let allowed: { rule: string; aligned: number }[] = [];
  try {
    allowed = JSON.parse(row.allowed_rules);
  } catch {
    /* malformed seed — treat as no allowed rules */
  }

  const normalized = rule.trim().toLowerCase();
  const match = allowed.find(r => r.rule.trim().toLowerCase() === normalized);

  return {
    defining_feature: row.defining_feature,
    aligned: match ? match.aligned === 1 : null,
  };
}
