-- ═══════════════════════════════════════════════════════════════
-- QuestSim ACE — Triangle Types Challenge
-- Fresh D1 schema (questsim-ace-triangle-types)
-- ═══════════════════════════════════════════════════════════════

-- Users: admin, teacher, student
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student')),
  google_id TEXT UNIQUE,
  avatar_url TEXT,
  school_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);

-- Sessions: JWT-backed, one per login
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Classes: teacher creates, students join via class code
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  class_code TEXT NOT NULL UNIQUE,
  pathway TEXT NOT NULL DEFAULT 'pythagorean_theorem',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_code ON classes(class_code);

-- Class membership (students belong to classes)
CREATE TABLE IF NOT EXISTS class_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_class ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_cs_student ON class_students(student_id);

-- Student profiles: per-student game state
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  tier TEXT NOT NULL DEFAULT 'foundation' CHECK (tier IN ('foundation', 'extension', 'mastery')),
  streak INTEGER NOT NULL DEFAULT 0,
  last_session_date TEXT,
  quest_state TEXT,
  mastery_state TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Game sessions: one per play session (check-in to reflection)
CREATE TABLE IF NOT EXISTS game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  class_id INTEGER REFERENCES classes(id),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  duration_seconds INTEGER,
  checkin_mood INTEGER,
  checkin_confidence INTEGER,
  checkin_goal TEXT,
  challenges_attempted INTEGER NOT NULL DEFAULT 0,
  challenges_correct INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  tier_at_start TEXT,
  tier_at_end TEXT
);
CREATE INDEX IF NOT EXISTS idx_gs_student ON game_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_gs_class ON game_sessions(class_id);

-- Challenge attempts: every answer submission
CREATE TABLE IF NOT EXISTS challenge_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES game_sessions(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  challenge_id TEXT NOT NULL,
  location TEXT NOT NULL,
  tier TEXT NOT NULL,
  user_answer TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  hints_used INTEGER NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER,
  was_scaffold INTEGER NOT NULL DEFAULT 0,
  was_fast_track INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ca_student ON challenge_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_ca_session ON challenge_attempts(session_id);

-- Analytics events: lightweight event log
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  class_id INTEGER REFERENCES classes(id),
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ae_student ON analytics_events(student_id);
CREATE INDEX IF NOT EXISTS idx_ae_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ae_created ON analytics_events(created_at);
