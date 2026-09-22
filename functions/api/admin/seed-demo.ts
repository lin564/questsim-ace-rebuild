// POST /api/admin/seed-demo — create a demo teacher, class, and 20 students
// This gives the admin something to demo until real students are added
import type { Env, DataContext } from '../../types';

const DEMO_FIRST_NAMES = ['Maya','Jaylen','Liam','Aisha','Noah','Sofia','Elena','Marcus','Zara','Ethan','Priya','Devon','Chloe','Ryan','Aaliyah','Tyler','Yuki','Malik','Ines','Sam'];
const DEMO_LAST_NAMES = ['Chen','Rivera','Thompson','Singh','Kim','Park','Vasquez','Johnson','Ahmed','Brown','Patel','Martinez','Garcia','Nguyen','Washington','Taylor','Tanaka','Jefferson','Delacroix','Cohen'];
const TIERS = ['foundation', 'extension', 'mastery'];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export const onRequestPost: PagesFunction<Env, any, DataContext> = async (context) => {
  const db = context.env.DB;
  const admin = context.data.user!;

  // Check if demo data already exists
  const existingDemo = await db.prepare("SELECT id FROM users WHERE email = 'demo.teacher@questsim.example'").first();
  if (existingDemo) {
    return Response.json({ error: 'Demo data already exists. Delete it first to re-seed.' }, { status: 409 });
  }

  // Create a demo teacher
  const teacherResult = await db.prepare(`
    INSERT INTO users (email, first_name, last_name, role, school_name)
    VALUES (?, ?, ?, 'teacher', ?)
  `).bind('demo.teacher@questsim.example', 'Demo', 'Teacher', 'QuestSim Middle School').run();
  const teacherId = teacherResult.meta.last_row_id;

  // Create a demo class owned by the demo teacher
  let classCode = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    classCode = generateClassCode();
    const exists = await db.prepare('SELECT id FROM classes WHERE class_code = ?').bind(classCode).first();
    if (!exists) break;
  }
  const classResult = await db.prepare(`
    INSERT INTO classes (teacher_id, name, class_code, pathway)
    VALUES (?, 'Period 3 — Geometry (Demo)', ?, 'pythagorean_theorem')
  `).bind(teacherId, classCode).run();
  const classId = classResult.meta.last_row_id;

  // Create 20 demo students with realistic varied data
  const students = [];
  for (let i = 0; i < 20; i++) {
    const fn = DEMO_FIRST_NAMES[i % DEMO_FIRST_NAMES.length];
    const ln = DEMO_LAST_NAMES[i % DEMO_LAST_NAMES.length];
    const email = `demo.${fn.toLowerCase()}.${ln.toLowerCase()}@questsim.example`;

    const studentResult = await db.prepare(`
      INSERT INTO users (email, first_name, last_name, role, school_name, last_login_at)
      VALUES (?, ?, ?, 'student', 'QuestSim Middle School', datetime('now', '-' || ? || ' days'))
    `).bind(email, fn, ln, randomInt(0, 7)).run();
    const studentId = studentResult.meta.last_row_id;

    // Create varied profile data
    const xp = randomInt(50, 1200);
    const level = Math.floor(xp / 100) + 1;
    const tier = TIERS[xp < 300 ? 0 : xp < 800 ? 1 : 2];
    const masteryConfidence = Math.random();

    await db.prepare(`
      INSERT INTO student_profiles (user_id, xp, level, tier, streak, last_session_date, mastery_state, quest_state)
      VALUES (?, ?, ?, ?, ?, date('now', '-' || ? || ' days'), ?, ?)
    `).bind(
      studentId, xp, level, tier,
      randomInt(0, 12),
      randomInt(0, 7),
      JSON.stringify({
        triangle_classification: { level: masteryConfidence > 0.6 ? 'proficient' : 'developing', confidence: masteryConfidence },
        finding_leg: { level: 'developing', confidence: Math.random() },
        finding_hypotenuse: { level: 'developing', confidence: Math.random() },
      }),
      JSON.stringify({ location: 'samos', fragments_found: randomInt(0, 4) })
    ).run();

    // Add to class
    await db.prepare('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)')
      .bind(classId, studentId).run();

    // Create some fake game sessions and challenge attempts
    const sessionCount = randomInt(1, 8);
    for (let s = 0; s < sessionCount; s++) {
      const challengesAttempted = randomInt(3, 12);
      const challengesCorrect = randomInt(Math.floor(challengesAttempted * 0.3), challengesAttempted);
      const sessionResult = await db.prepare(`
        INSERT INTO game_sessions
        (student_id, class_id, started_at, ended_at, duration_seconds,
         checkin_mood, checkin_confidence, challenges_attempted, challenges_correct, xp_earned, tier_at_start, tier_at_end)
        VALUES (?, ?, datetime('now', '-' || ? || ' days'), datetime('now', '-' || ? || ' days', '+' || ? || ' minutes'),
                ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        studentId, classId,
        randomInt(0, 14), randomInt(0, 14), randomInt(10, 30),
        randomInt(10, 30) * 60,
        randomInt(1, 5), randomInt(1, 5),
        challengesAttempted, challengesCorrect,
        challengesCorrect * randomInt(15, 30),
        tier, tier
      ).run();
      const sessionId = sessionResult.meta.last_row_id;

      // Create attempt records
      for (let c = 0; c < challengesAttempted; c++) {
        await db.prepare(`
          INSERT INTO challenge_attempts
          (session_id, student_id, challenge_id, location, tier, is_correct, attempt_number, hints_used, xp_awarded)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          sessionId, studentId,
          ['ch_samos_f1','ch_athens_f1','ch_athens_e1','ch_rhodes_f1','ch_rhodes_e1'][randomInt(0, 4)],
          ['samos','athens','rhodes','alexandria'][randomInt(0, 3)],
          tier,
          c < challengesCorrect ? 1 : 0,
          randomInt(1, 3),
          randomInt(0, 2),
          c < challengesCorrect ? randomInt(15, 30) : 0
        ).run();
      }
    }

    students.push({ id: studentId, name: `${fn} ${ln}`, xp, level, tier });
  }

  // Log the seed event
  await db.prepare('INSERT INTO analytics_events (student_id, event_type, event_data) VALUES (?, ?, ?)')
    .bind(admin.id, 'demo_seeded', JSON.stringify({ class_id: classId, student_count: 20 })).run();

  return Response.json({
    ok: true,
    teacher_id: teacherId,
    class_id: classId,
    class_code: classCode,
    student_count: 20,
    message: `Seeded 1 teacher, 1 class (${classCode}), and 20 students with game data.`,
  });
};
