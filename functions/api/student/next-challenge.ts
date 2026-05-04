// GET /api/student/next-challenge
//
// Adaptive picker. Reads the student's learner_signals across categories
// and picks the next category to challenge them on.
//
// Selection rule (in priority order):
//   1. If any category has belief_alignment < 0.5 with at least 2
//      endorsements, pick it — the student has a misconception we
//      should target before drilling skill.
//   2. Otherwise pick the category with the lowest fluency that has
//      at least 1 attempt — the weakest skill.
//   3. Otherwise pick the category the student has touched least
//      (or 'equilateral' as a cold-start default).
//
// Tier is derived from overall fluency:
//   < 0.5  → foundation
//   < 0.8  → extension
//   else   → mastery
//
// Returns:
//   { category, tier, reason, signals: { fluency, belief_alignment, attempts } }

import type { Env, DataContext } from '../../types';

const ALL_CATEGORIES = ['equilateral', 'isosceles', 'scalene', 'right'];

interface SignalRow {
  category: string;
  fluency: number;
  belief_alignment: number;
  attempts_count: number;
  endorsements_count: number;
}

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  const sigs = await db.prepare(`
    SELECT category, fluency, belief_alignment, attempts_count, endorsements_count
    FROM learner_signals
    WHERE user_id = ?
  `).bind(user.id).all<SignalRow>();

  const byCat = new Map<string, SignalRow>();
  for (const r of sigs.results) byCat.set(r.category, r);

  // 1. Misconception trumps weak skill.
  const misconceptions = sigs.results
    .filter(r => r.endorsements_count >= 2 && r.belief_alignment < 0.5)
    .sort((a, b) => a.belief_alignment - b.belief_alignment);
  if (misconceptions.length > 0) {
    const r = misconceptions[0];
    return Response.json({
      category: r.category,
      tier: tierFromFluency(r.fluency),
      reason: 'misconception',
      signals: {
        fluency: r.fluency,
        belief_alignment: r.belief_alignment,
        attempts: r.attempts_count,
      },
    });
  }

  // 2. Weakest skill that the learner has actually touched.
  const touched = sigs.results
    .filter(r => r.attempts_count > 0)
    .sort((a, b) => a.fluency - b.fluency);
  if (touched.length > 0) {
    const r = touched[0];
    return Response.json({
      category: r.category,
      tier: tierFromFluency(r.fluency),
      reason: 'weakest_skill',
      signals: {
        fluency: r.fluency,
        belief_alignment: r.belief_alignment,
        attempts: r.attempts_count,
      },
    });
  }

  // 3. Cold-start: pick the category the learner has touched least.
  // (Equilateral is the easiest concept to seed with.)
  const untouched = ALL_CATEGORIES.find(c => !byCat.has(c)) ?? 'equilateral';
  return Response.json({
    category: untouched,
    tier: 'foundation',
    reason: 'cold_start',
    signals: { fluency: 0, belief_alignment: 0, attempts: 0 },
  });
};

function tierFromFluency(f: number): 'foundation' | 'extension' | 'mastery' {
  if (f < 0.5) return 'foundation';
  if (f < 0.8) return 'extension';
  return 'mastery';
}
