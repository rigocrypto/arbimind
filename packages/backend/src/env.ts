/**
 * Load .env before any other module. Must be the first import in index.ts.
 * adminAuth and other modules read process.env at import time.
 */
import dotenv from 'dotenv';
import path from 'path';

const base = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(base, '.env') });
dotenv.config(); // fallback to cwd
