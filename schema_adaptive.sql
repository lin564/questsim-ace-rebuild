-- ═══════════════════════════════════════════════════════════════
-- QuestSim ACE — Adaptive pipeline (Pythagoras Rebuild PR #3)
-- Run AFTER schema.sql. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- Catalog of categories and the canonical defining feature plus the
-- set of belief-rules a student is allowed to endorse for that
-- category. allowed_rules is a JSON array of { rule, aligned } so the
-- server can compare student endorsement against the category's true
-- defining feature without an LLM round-trip.
CREATE TABLE IF NOT EXISTS category_rules (
  category TEXT PRIMARY KEY,
  defining_feature TEXT NOT NULL,
  allowed_rules TEXT NOT NULL,  -- JSON: [{ "rule": "...", "aligned": 0|1 }, ...]
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Triangle Types seed data. `aligned=1` means the rule actually
-- defines the category; `aligned=0` is a plausible-but-wrong
-- belief that we want to surface as a misconception.
INSERT OR REPLACE INTO category_rules (category, defining_feature, allowed_rules) VALUES
  ('equilateral', 'three equal sides', json('[
    {"rule":"three equal sides","aligned":1},
    {"rule":"all angles are 60","aligned":1},
    {"rule":"looks symmetrical","aligned":0},
    {"rule":"has a pointy top","aligned":0}
  ]')),
  ('isosceles', 'exactly two equal sides', json('[
    {"rule":"exactly two equal sides","aligned":1},
    {"rule":"two equal base angles","aligned":1},
    {"rule":"looks symmetrical","aligned":0},
    {"rule":"has a pointy top","aligned":0}
  ]')),
  ('scalene', 'no equal sides', json('[
    {"rule":"no equal sides","aligned":1},
    {"rule":"all angles are different","aligned":1},
    {"rule":"looks lopsided","aligned":0},
    {"rule":"has no symmetry","aligned":0}
  ]')),
  ('right', 'one 90 degree angle', json('[
    {"rule":"one 90 degree angle","aligned":1},
    {"rule":"has a square corner","aligned":1},
    {"rule":"looks like a ramp","aligned":0},
    {"rule":"has one long side","aligned":0}
  ]'));

-- Per-placement event log. One row per drop-into-bin. Captures the
-- gesture telemetry (dwell, latency) and the post-placement endorsement
-- so the full Maya-gesture pipeline is replayable from this table.
CREATE TABLE IF NOT EXISTS placement_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER REFERENCES challenge_attempts(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES game_sessions(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  tile TEXT NOT NULL,                 -- the actual triangle tile (e.g. "isosceles_03")
  actual_category TEXT NOT NULL,      -- the correct category for the tile
  placed_as TEXT NOT NULL,            -- the bin the student dropped it in
  is_correct INTEGER NOT NULL,        -- 1 if placed_as == actual_category
  dwell_ms INTEGER,                   -- pickup → first-bin-hover (or null if unknown)
  latency_ms INTEGER,                 -- pickup → drop
  endorsed_rule TEXT,                 -- rule student endorsed after the drop
  alignment_status TEXT,              -- 'aligned' | 'misaligned' | 'unknown' | null pre-endorse
  redirect_line TEXT,                 -- LLM-generated feature-specific redirect
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pe_student ON placement_events(student_id);
CREATE INDEX IF NOT EXISTS idx_pe_session ON placement_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pe_pair ON placement_events(student_id, placed_as, actual_category);

-- Per-learner adaptive signal cache. Recomputed on each placement.
-- `category` is the category the signal pertains to; one row per
-- (user, category). Both metrics are 0..1.
CREATE TABLE IF NOT EXISTS learner_signals (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  fluency REAL NOT NULL DEFAULT 0,            -- recency-weighted accuracy
  belief_alignment REAL NOT NULL DEFAULT 0,   -- aligned endorsements / total
  attempts_count INTEGER NOT NULL DEFAULT 0,
  endorsements_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category)
);
CREATE INDEX IF NOT EXISTS idx_ls_category ON learner_signals(category);

-- LLM redirect-line cache. Keyed on the (placed_as, actual, rule) triple
-- because the line is deterministic in those three. Saves ~$/latency
-- after the first occurrence of a given misconception.
CREATE TABLE IF NOT EXISTS redirect_cache (
  cache_key TEXT PRIMARY KEY,         -- "{placed_as}|{actual}|{rule}"
  line TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
