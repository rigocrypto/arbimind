import dotenv from 'dotenv';
import path from 'path';

/**
 * Bootstrap environment variables from .env.local or .env
 * This centralizes env loading for all entrypoints (index.ts, tests, scripts, workers)
 * Prevents regressions if files get rearranged or new entrypoints are added
 */
export function loadEnv(): void {
  // First try .env.local for local dev
  if (process.env['NODE_ENV'] !== 'production') {
    const localEnvPath = path.resolve(process.cwd(), '.env.local');
    dotenv.config({ path: localEnvPath });
  }
  
  // Then load .env as fallback (allows .env.local to override .env)
  dotenv.config();
}
