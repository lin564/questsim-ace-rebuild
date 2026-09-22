// GET /api/teacher/student-detail — full detail for a single student in a class
// Query params:
//   class_id   required
//   student_id required
//
// Gated by the teacher middleware. The class must belong to this teacher
// (or the caller must be admin). Returns the student's profile, parsed
// mastery_state, last N challenge_attempts with parsed user_answer JSON,
// a per-concept confusion matrix aggregated from the attempts' answer_log,
// and session summary stats. Used to render the slide-in detail drawer
// on the teacher dashboard.
import type { Env, DataContext } from '../../types';

interface AttemptRow {
  id: number;
  session_id: number;
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
}

interface SessionRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  challenges_attempted: number;
  challenges_correct: number;
  xp_earned: number;
}

interface StudentRow {
  id: number;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  xp: number | null;
  level: number | null;
  tier: string | null;
  streak: number | null;
  mastery_state: string | null;
}

// Maps a Unity drop-target name to the triangle-type concept key.
// Mirrors the mapping used in the ACE parent's mastery computation.
const TARGET_CONCEPT: Record<string, string> = {
  'DropTarget_01': 'equilateral',
  'DropTarget_02': 'right',
  'DropTarget_03': 'isosceles',
  'DropTarget_04': 'scalene',
};

const CONCEPTS = ['equilateral', 'right', 'isosceles', 'scalene'];

export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;
  const url = new URL(context.request.url);

  const classId = parseInt(url.searchParams.get('class_id') || '', 10);
  const studentId = parseInt(url.searchParams.get('student_id') || '', 10);

  if (!classId || isNaN(classId)) {
    return Response.json({ error: 'class_id query parameter is required' }, { status: 400 });
  }
  if (!studentId || isNaN(studentId)) {
    return Response.json({ error: 'student_id query parameter is required' }, { status: 400 });
  }

  // Verify class exists and belongs to the teacher (unless caller is admin)
  const classRow = await db.prepare(
    'SELECT id, name, class_code, teacher_id FROM classes WHERE id = ?'
  ).bind(classId).first<{ id: number; name: string; class_code: string; teacher_id: number }>();
  if (!classRow) {
    return Response.json({ error: 'Class not found' }, { status: 404 });
  }
  if (user.role !== 'admin' && classRow.teacher_id !== user.id) {
    return Response.json({ error: 'Forbidden: you do not own this class' }, { status: 403 });
  }

  // Verify student is in the class
  const membership = await db.prepare(
    'SELECT id FROM class_students WHERE class_id = ? AND student_id = ? AND is_active = 1'
  ).bind(classId, studentId).first();
  if (!membership) {
    return Response.json({ error: 'Student is not in this class' }, { status: 404 });
  }

  // Student profile + user row joined
  const student = await db.prepare(`
    SELECT
      u.id, u.first_name, u.last_name, u.avatar_url,
      sp.xp, sp.level, sp.tier, sp.streak, sp.mastery_state
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE u.id = ?
  `).bind(studentId).first<StudentRow>();
  if (!student) {
    return Response.json({ error: 'Student not found' }, { status: 404 });
  }

  // Parse mastery_state JSON into a per-concept object
  let masteryByConcept: Record<string, any> = {};
  try {
    if (student.mastery_state) masteryByConcept = JSON.parse(student.mastery_state);
  } catch { /* leave empty */ }

  // Last 10 challenge_attempts for this student (joined implicitly by student_id)
  const attemptsResult = await db.prepare(`
    SELECT id, session_id, challenge_id, location, tier, user_answer,
           is_correct, attempt_number, hints_used, time_spent_seconds,
           was_scaffold, was_fast_track, xp_awarded, created_at
    FROM challenge_attempts
    WHERE student_id = ?
    ORDER BY id DESC
    LIMIT 10
  `).bind(studentId).all<AttemptRow>();

  // Parse user_answer JSON for each attempt so the frontend can render
  // the per-drop answer_log directly.
  const attempts = attemptsResult.results.map((a) => {
    let parsedAnswer: any = a.user_answer;
    try {
      if (a.user_answer && a.user_answer.startsWith('{')) {
        parsedAnswer = JSON.parse(a.user_answer);
      }
    } catch { /* leave as-is */ }
    return {
      id: a.id,
      session_id: a.session_id,
      challenge_id: a.challenge_id,
      location: a.location,
      tier: a.tier,
      is_correct: !!a.is_correct,
      attempt_number: a.attempt_number,
      hints_used: a.hints_used,
      time_spent_seconds: a.time_spent_seconds,
      was_scaffold: !!a.was_scaffold,
      was_fast_track: !!a.was_fast_track,
      xp_awarded: a.xp_awarded,
      user_answer: parsedAnswer,
      created_at: a.created_at,
    };
  });

  // Build a per-student confusion matrix by walking all answer_log entries
  // across this student's recent attempts. Rows = actual concept,
  // cols = placed_as concept. Same 4×4 shape as the presentation slide.
  const matrix: Record<string, Record<string, number>> = {};
  for (const c of CONCEPTS) {
    matrix[c] = {};
    for (const d of CONCEPTS) matrix[c][d] = 0;
  }
  // Maps tile name to the concept it represents. Triangle-shape tiles carry
  // the concept directly in their name; property tiles ("Straight Sides",
  // "3 Equal Angles" etc.) can belong to multiple rows so we skip them for
  // the confusion matrix — only aggregate Grab_Triangles items.
  const TILE_CONCEPT: Record<string, string> = {
    'EquilateralT': 'equilateral',
    'RightT': 'right',
    'IsoscelesT': 'isosceles',
    'ScaleneT': 'scalene',
  };

  for (const att of attempts) {
    const answerLog = (att.user_answer && att.user_answer.answer_log) || [];
    if (!Array.isArray(answerLog)) continue;
    for (const entry of answerLog) {
      if (!entry || typeof entry !== 'object') continue;
      const actualConcept = TILE_CONCEPT[entry.tile];
      const placedConcept = TARGET_CONCEPT[entry.target];
      if (!actualConcept || !placedConcept) continue;
      matrix[actualConcept][placedConcept]++;
    }
  }

  // Recent sessions (last 5)
  const sessionsResult = await db.prepare(`
    SELECT id, started_at, ended_at, duration_seconds,
           challenges_attempted, challenges_correct, xp_earned
    FROM game_sessions
    WHERE student_id = ? AND class_id = ?
    ORDER BY id DESC
    LIMIT 5
  `).bind(studentId, classId).all<SessionRow>();

  // Aggregate summary stats
  const totalAttemptsResult = await db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
           SUM(COALESCE(xp_awarded, 0)) AS total_xp
    FROM challenge_attempts
    WHERE student_id = ?
  `).bind(studentId).first<{ total: number; correct: number; total_xp: number }>();

  return Response.json({
    class: { id: classRow.id, name: classRow.name, class_code: classRow.class_code },
    student: {
      id: student.id,
      name: `${student.first_name} ${student.last_name}`.trim(),
      first_name: student.first_name,
      last_name: student.last_name,
      avatar_url: student.avatar_url,
      xp: student.xp ?? 0,
      level: student.level ?? 1,
      tier: student.tier ?? 'foundation',
      streak: student.streak ?? 0,
    },
    mastery_by_concept: masteryByConcept,
    attempts,
    sessions: sessionsResult.results,
    confusion_matrix: matrix,
    summary: {
      total_attempts: totalAttemptsResult?.total ?? 0,
      correct_attempts: totalAttemptsResult?.correct ?? 0,
      total_xp: totalAttemptsResult?.total_xp ?? 0,
      accuracy: (totalAttemptsResult?.total ?? 0) > 0
        ? Math.round(((totalAttemptsResult!.correct / totalAttemptsResult!.total)) * 100) / 100
        : 0,
    },
  });
};
