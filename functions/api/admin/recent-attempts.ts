// Admin debug: return the most recent challenge_attempts rows with parsed
// user_answer JSON, student name, and current mastery_state — so we can
// eyeball the full learning-analytics pipeline end-to-end without needing
// to run wrangler SQL. Admin-only (gated by _middleware.ts in this folder).
//
// GET /api/admin/recent-attempts?limit=20&student_id=3
//   limit       optional, default 20, max 100
//   student_id  optional filter by student
import type { Env, DataContext } from '../../types';

interface AttemptRow {
  id: number;
  session_id: number;
  student_id: number;
  first_name: string;
  last_name: string;
  challenge_id: string;
  location: string;
  tier: string;
  user_answer: string | null;
  is_correct: number;
  attempt_number: number;
  hints_used: number;
  time_spent_seconds: number | null;
  was_scaffold: number;
  was_fast_track: number;
  xp_awarded: number;
  created_at: string;
  mastery_state: string | null;
  profile_xp: number | null;
  profile_level: number | null;
  profile_tier: string | null;
}

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const url = new URL(context.request.url);
  const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 100);
  const studentIdParam = url.searchParams.get('student_id');
  const studentId = studentIdParam ? parseInt(studentIdParam, 10) : null;

  const whereClause = studentId && !isNaN(studentId) ? 'WHERE ca.student_id = ?' : '';
  const bindings: any[] = studentId && !isNaN(studentId) ? [studentId, limit] : [limit];

  const query = `
    SELECT
      ca.id,
      ca.session_id,
      ca.student_id,
      u.first_name,
      u.last_name,
      ca.challenge_id,
      ca.location,
      ca.tier,
      ca.user_answer,
      ca.is_correct,
      ca.attempt_number,
      ca.hints_used,
      ca.time_spent_seconds,
      ca.was_scaffold,
      ca.was_fast_track,
      ca.xp_awarded,
      ca.created_at,
      sp.mastery_state,
      sp.xp AS profile_xp,
      sp.level AS profile_level,
      sp.tier AS profile_tier
    FROM challenge_attempts ca
    JOIN users u ON ca.student_id = u.id
    LEFT JOIN student_profiles sp ON sp.user_id = ca.student_id
    ${whereClause}
    ORDER BY ca.id DESC
    LIMIT ?
  `;

  const { results } = await context.env.DB.prepare(query).bind(...bindings).all<AttemptRow>();

  // Enrich each row by parsing the JSON fields so you can read them directly
  // in the response instead of eyeballing escaped strings.
  const enriched = results.map((r) => {
    let parsedUserAnswer: any = r.user_answer;
    try {
      if (r.user_answer && r.user_answer.startsWith('{')) {
        parsedUserAnswer = JSON.parse(r.user_answer);
      }
    } catch { /* leave as string */ }

    let parsedMastery: any = null;
    try {
      if (r.mastery_state) parsedMastery = JSON.parse(r.mastery_state);
    } catch { /* leave as null */ }

    return {
      id: r.id,
      session_id: r.session_id,
      student: {
        id: r.student_id,
        name: `${r.first_name} ${r.last_name}`.trim(),
      },
      challenge_id: r.challenge_id,
      location: r.location,
      tier: r.tier,
      is_correct: !!r.is_correct,
      attempt_number: r.attempt_number,
      hints_used: r.hints_used,
      time_spent_seconds: r.time_spent_seconds,
      was_scaffold: !!r.was_scaffold,
      was_fast_track: !!r.was_fast_track,
      xp_awarded: r.xp_awarded,
      user_answer: parsedUserAnswer,
      created_at: r.created_at,
      student_profile: {
        xp: r.profile_xp,
        level: r.profile_level,
        tier: r.profile_tier,
        mastery_state: parsedMastery,
      },
    };
  });

  return Response.json({
    count: enriched.length,
    filter: { limit, student_id: studentId },
    attempts: enriched,
  });
};
