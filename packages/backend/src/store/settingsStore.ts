/**
 * Postgres-backed settings store.
 * If DATABASE_URL is unset, falls back to in-memory defaults only (read-only).
 */

import { Pool } from 'pg';
import {
  EngineSettings,
  DEFAULT_ENGINE_SETTINGS,
  engineSettingsSchema,
} from '../types/settings';

let pool: Pool | null = null;
let initialized = false;

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 3 });
  }
  return pool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS engine_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export async function initSettingsSchema(): Promise<void> {
  const p = getPool();
  if (!p || initialized) return;
  try {
    await p.query(SCHEMA_SQL);
    initialized = true;
  } catch (err) {
    console.error('[SETTINGS-STORE] Schema init failed:', err);
  }
}

function withTimestamp(s: Omit<EngineSettings, 'updatedAt'>): EngineSettings {
  return { ...s, updatedAt: new Date().toISOString() };
}

function mergeDefaults(partial: Record<string, unknown>): Omit<EngineSettings, 'updatedAt'> {
  return { ...DEFAULT_ENGINE_SETTINGS, ...partial };
}

function validate(raw: Record<string, unknown>): { value?: Omit<EngineSettings, 'updatedAt'>; error?: string; details?: Array<{ path: string; message: string }> } {
  const merged = mergeDefaults(raw);
  const { error, value } = engineSettingsSchema.validate(merged, { abortEarly: false });
  if (error) {
    return {
      error: 'Validation failed',
      details: error.details.map((d) => ({
        path: d.path.join('.'),
        message: d.message,
      })),
    };
  }
  return { value: value as Omit<EngineSettings, 'updatedAt'> };
}

export async function getSettings(): Promise<EngineSettings> {
  await initSettingsSchema();
  const p = getPool();
  if (!p) return withTimestamp(DEFAULT_ENGINE_SETTINGS);

  try {
    const { rows } = await p.query<{ settings: Record<string, unknown>; updated_at: Date }>(
      'SELECT settings, updated_at FROM engine_settings WHERE id = 1',
    );
    if (rows.length === 0) {
      return withTimestamp(DEFAULT_ENGINE_SETTINGS);
    }
    const row = rows[0];
    if (!row) return withTimestamp(DEFAULT_ENGINE_SETTINGS);
    const merged = mergeDefaults(row.settings);
    return { ...merged, updatedAt: row.updated_at.toISOString() };
  } catch (err) {
    console.error('[SETTINGS-STORE] getSettings error:', err);
    return withTimestamp(DEFAULT_ENGINE_SETTINGS);
  }
}

export async function updateSettings(
  partial: Record<string, unknown>,
): Promise<{ settings?: EngineSettings; error?: string; details?: Array<{ path: string; message: string }> }> {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { updatedAt: _drop, ...rest } = merged;
  const result = validate(rest);

  if (result.error) {
    return { error: result.error, details: result.details ?? [] };
  }

  const p = getPool();
  if (!p) {
    return { settings: withTimestamp(result.value!) };
  }

  try {
    const { rows } = await p.query<{ settings: Record<string, unknown>; updated_at: Date }>(
      `INSERT INTO engine_settings (id, settings, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET settings = $1::jsonb, updated_at = now()
       RETURNING settings, updated_at`,
      [JSON.stringify(result.value)],
    );
    const row = rows[0];
    if (!row) return { settings: withTimestamp(result.value!) };
    const saved = mergeDefaults(row.settings);
    return { settings: { ...saved, updatedAt: row.updated_at.toISOString() } };
  } catch (err) {
    console.error('[SETTINGS-STORE] updateSettings error:', err);
    return { error: 'Failed to persist settings' };
  }
}

export async function resetSettings(): Promise<EngineSettings> {
  const p = getPool();
  if (!p) return withTimestamp(DEFAULT_ENGINE_SETTINGS);

  try {
    const { rows } = await p.query<{ settings: Record<string, unknown>; updated_at: Date }>(
      `INSERT INTO engine_settings (id, settings, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET settings = $1::jsonb, updated_at = now()
       RETURNING settings, updated_at`,
      [JSON.stringify(DEFAULT_ENGINE_SETTINGS)],
    );
    const row = rows[0];
    if (!row) return withTimestamp(DEFAULT_ENGINE_SETTINGS);
    const saved = mergeDefaults(row.settings);
    return { ...saved, updatedAt: row.updated_at.toISOString() };
  } catch (err) {
    console.error('[SETTINGS-STORE] resetSettings error:', err);
    return withTimestamp(DEFAULT_ENGINE_SETTINGS);
  }
}
