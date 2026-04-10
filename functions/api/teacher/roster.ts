// Teacher roster API: detailed class roster with student stats
import type { Env, DataContext } from '../../types';

interface StudentRow {
  student_id: number;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  xp: number;
  level: number;
  tier: string;
  mastery_state: string | null;
  joined_at: string;
}

interface SessionRow {
  student_id: number;
  total_sessions: number;
  last_active: string | null;
}

interface AttemptRow {
  student_id: number;
  total_attempts: number;
  correct_attempts: number;
}

// GET: return full roster for a class with student profiles, sessions, and stats
export const onRequestGet: PagesFunction<Env, any, DataContext> = async (context) => {
  const user = context.data.user!;
  const db = context.env.DB;

  const url = new URL(context.request.url);
  const classId = url.searchParams.get('class_id');

  if (!classId) {
    return Response.json({ error: 'class_id query parameter is required' }, { status: 400 });
  }

  const classIdNum = parseInt(classId, 10);
  if (isNaN(classIdNum)) {
    return Response.json({ error: 'class_id must be a number' }, { status: 400 });
  }

  // Verify the class exists and belongs to this teacher (or user is admin)
  const classRow = await db.prepare(
    'SELECT id, name, class_code, teacher_id FROM classes WHERE id = ?'
  ).bind(classIdNum).first<{ id: number; name: string; class_code: string; teacher_id: number }>();

  if (!classRow) {
    return Response.json({ error: 'Class not found' }, { status: 404 });
  }

  if (user.role !== 'admin' && classRow.teacher_id !== user.id) {
    return Response.json({ error: 'Forbidden: you do not own this class' }, { status: 403 });
  }

  // Fetch students with their profiles
  const studentsResult = await db.prepare(`
    SELECT
      u.id AS student_id,
      u.first_name,
      u.last_name,
      u.avatar_url,
      COALESCE(sp.xp, 0) AS xp,
      COALESCE(sp.level, 1) AS level,
      COALESCE(sp.tier, 'foundation') AS tier,
      sp.mastery_state,
      cs.joined_at
    FROM class_students cs
    JOIN users u ON cs.student_id = u.id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE cs.class_id = ? AND cs.is_active = 1
    ORDER BY u.last_name, u.first_name
  `).bind(classIdNum).all<StudentRow>();

  const students = studentsResult.results;
  const studentIds = students.map(s => s.student_id);

  // If no students, return early with empty data
  if (studentIds.length === 0) {
    return Response.json({
      class: { id: classRow.id, name: classRow.name, class_code: classRow.class_code },
      students: [],
      stats: {
        total: 0,
        active_today: 0,
        avg_mastery: 0,
        tiers: { foundation: 0, extension: 0, mastery: 0 },
      },
    });
  }

  // Build placeholder list for IN clause
  const placeholders = studentIds.map(() => '?').join(', ');

  // Aggregate game_sessions per student for this class
  const sessionsResult = await db.prepare(`
    SELECT
      student_id,
      COUNT(*) AS total_sessions,
      MAX(COALESCE(ended_at, started_at)) AS last_active
    FROM game_sessions
    WHERE class_id = ? AND student_id IN (${placeholders})
    GROUP BY student_id
  `).bind(classIdNum, ...studentIds).all<SessionRow>();

  const sessionsMap = new Map<number, SessionRow>();
  for (const row of sessionsResult.results) {
    sessionsMap.set(row.student_id, row);
  }

  // Aggregate challenge_attempts per student
  const attemptsResult = await db.prepare(`
    SELECT
      ca.student_id,
      COUNT(*) AS total_attempts,
      SUM(CASE WHEN ca.is_correct = 1 THEN 1 ELSE 0 END) AS correct_attempts
    FROM challenge_attempts ca
    JOIN game_sessions gs ON ca.session_id = gs.id
    WHERE gs.class_id = ? AND ca.student_id IN (${placeholders})
    GROUP BY ca.student_id
  `).bind(classIdNum, ...studentIds).all<AttemptRow>();

  const attemptsMap = new Map<number, AttemptRow>();
  for (const row of attemptsResult.results) {
    attemptsMap.set(row.student_id, row);
  }

  // Count students active today
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const activeTodayResult = await db.prepare(`
    SELECT COUNT(DISTINCT student_id) AS active_count
    FROM game_sessions
    WHERE class_id = ? AND student_id IN (${placeholders})
      AND date(COALESCE(ended_at, started_at)) = ?
  `).bind(classIdNum, ...studentIds, todayStr).first<{ active_count: number }>();

  const activeToday = activeTodayResult?.active_count ?? 0;

  // Parse mastery_state JSON and compute per-student mastery percentage.
  // mastery_state structure: { concept1: { level: string, confidence: number }, ... }
  function computeMastery(masteryState: string | null): number {
    if (!masteryState) return 0;
    try {
      const state = JSON.parse(masteryState);
      if (typeof state === 'object' && state !== null) {
        const entries = Object.values(state) as any[];
        if (entries.length === 0) return 0;
        // Extract confidence numbers (skip entries missing confidence)
        const confidences = entries
          .map(e => (e && typeof e === 'object' && typeof e.confidence === 'number') ? e.confidence : null)
          .filter((c): c is number => c !== null);
        if (confidences.length === 0) return 0;
        const sum = confidences.reduce((a, b) => a + b, 0);
        return Math.round((sum / confidences.length) * 100) / 100;
      }
    } catch {
      // ignore parse errors
    }
    return 0;
  }

  // Build detailed student list
  const enrichedStudents = students.map(s => {
    const session = sessionsMap.get(s.student_id);
    const attempt = attemptsMap.get(s.student_id);
    const mastery = computeMastery(s.mastery_state);
    const totalAttempts = attempt?.total_attempts ?? 0;
    const correctAttempts = attempt?.correct_attempts ?? 0;
    const confidence = totalAttempts > 0
      ? Math.round((correctAttempts / totalAttempts) * 100) / 100
      : 0;

    return {
      student_id: s.student_id,
      name: `${s.first_name} ${s.last_name}`.trim(),
      avatar_url: s.avatar_url,
      xp: s.xp,
      level: s.level,
      tier: s.tier,
      mastery,
      challenges_completed: correctAttempts,
      sessions_completed: session?.total_sessions ?? 0,
      last_active: session?.last_active ?? null,
      confidence,
    };
  });

  // Aggregate stats
  const totalStudents = enrichedStudents.length;
  const avgMastery = totalStudents > 0
    ? Math.round(
        (enrichedStudents.reduce((sum, s) => sum + s.mastery, 0) / totalStudents) * 100
      ) / 100
    : 0;

  const tiers = { foundation: 0, extension: 0, mastery: 0 };
  for (const s of enrichedStudents) {
    const t = s.tier.toLowerCase();
    if (t === 'foundation') tiers.foundation++;
    else if (t === 'extension') tiers.extension++;
    else if (t === 'mastery') tiers.mastery++;
  }

  return Response.json({
    class: { id: classRow.id, name: classRow.name, class_code: classRow.class_code },
    students: enrichedStudents,
    stats: {
      total: totalStudents,
      active_today: activeToday,
      avg_mastery: avgMastery,
      tiers,
    },
  });
};
