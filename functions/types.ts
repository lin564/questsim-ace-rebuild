// Shared types for all Functions
export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  JWT_SECRET: string;
  APP_URL: string;
  GAME_ORIGIN: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'teacher' | 'student';
  google_id: string | null;
  avatar_url: string | null;
  school_name: string | null;
}

export type DataContext = { user: User | null };
