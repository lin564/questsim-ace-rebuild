# QuestSim ACE Prototype — Pythagoras Quest

**An immersive, narrative-driven math learning adventure demonstrating the Adaptive Challenge Engine (ACE) architecture.**

🔗 **Live Demo:** https://questsim-ace-rebuild.pages.dev

## What This Is

A fully interactive prototype of QuestSim's Pythagoras Quest — a browser-based 3D adventure learning game that teaches the Pythagorean Theorem to middle and high school students. Set in Ancient Greece, narrated and taught by Pythagoras himself, students travel from Athens to Alexandria solving real-world geometry problems.

## Adaptive Challenge Engine (ACE) Features

This prototype demonstrates all five ACE objects in action:

- **Learner Profile** — Student check-in with mood, confidence, and session goals
- **Challenge** — Multi-step narrative challenges at Athens, Rhodes, and Alexandria
- **Mastery Map** — Concept-granular progress tracking with confidence scores
- **Difficulty Pathway** — Three tiers (Foundation → Extension → Mastery) with automatic transitions
- **Feedback Loop** — Adaptive branching based on student performance:
  - 🌿 **Scaffold Path** — Students who struggle get narrative side-quests with easier numbers
  - ⚡ **Fast-Track Path** — Students who solve quickly get harder variants for bonus XP
  - 🎭 **Affective Feedback** — Response tone adapts to attempt count and hint usage

## Student Experience

1. **Dashboard** — Session overview, quest progress, fragment collection
2. **Check-In** — Pre-session mood and confidence assessment
3. **Quest Map** — Navigate Ancient Mediterranean with voyage information
4. **Challenges** — Pythagoras guides students through contextual math problems
5. **Pulse Check** — Mid-session engagement monitoring
6. **Reflection** — Post-session metacognition and self-assessment
7. **Capstone** — Build the Visual Proof with guided algebraic reasoning

## Teacher Experience

- **Class Dashboard** — Real-time engagement and tier distribution
- **Analytics** — Bottleneck detection, effort vs. advancement analysis
- **Intervention Builders** — Create scaffolded warm-ups and calculation references
- **Scenario Builder** — Three-voice feedback system configuration
- **Gradebook** — Per-student mastery tracking

## Technology

**Frontend:** vanilla HTML, CSS, and JavaScript in `public/`, no build step, no framework. Runs in any modern browser.

**Backend:** Cloudflare Pages Functions in `functions/api/*` (TypeScript), backed by a Cloudflare D1 database (`schema.sql`). Auth is Google OAuth with JWT sessions.

**Game embed:** the Unity WebGL quest at `https://pymini1.questsim.com`, communicated with via `postMessage` for activity completion and telemetry.

## Deployment

This site runs on **Cloudflare Pages** with a **D1** database and Pages Functions (`functions/api/*`) handling auth, telemetry, and teacher/admin endpoints. The Unity WebGL game shell is hosted separately at `https://pymini1.questsim.com` and embedded via `postMessage`.

To deploy your own instance:

1. **Fork this repository** and clone it locally.
2. **Create a Cloudflare Pages project** pointed at your fork. Set the build output directory to `public` (no build command required).
3. **Provision a D1 database**, then apply the schema:
   ```bash
   npx wrangler d1 create questsim-ace-<your-suffix>
   npx wrangler d1 execute <db-name> --remote --file=./schema.sql
   ```
   Copy the returned `database_id` into `wrangler.toml`.
4. **Set the three Pages secrets** (used by the auth flow and JWT signing):
   ```bash
   npx wrangler pages secret put GOOGLE_CLIENT_ID
   npx wrangler pages secret put GOOGLE_CLIENT_SECRET
   npx wrangler pages secret put JWT_SECRET
   ```
5. **Create Google OAuth credentials** in the Google Cloud console and add your Pages URL + `/api/auth/google-callback` as an authorized redirect URI.
6. **Update `wrangler.toml`** so `APP_URL` and `GOOGLE_REDIRECT_URI` match your own Pages domain.
7. Push to your default branch. Cloudflare Pages will build and deploy on each commit.

## About QuestSim

QuestSim is a browser-based 3D adventure learning game platform for K-12 students, developed by UltiSim Inc. The Adaptive Challenge Engine is QuestSim's core instructional technology — an object-oriented system that adjusts challenge difficulty, cognitive level, and narrative scaffolding in real time based on each student's performance.

© 2026 UltiSim Inc. / QuestSim
