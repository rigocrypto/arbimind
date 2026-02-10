/**
 * Postgres DB for portfolio daily snapshots.
 * Optional: if DATABASE_URL is not set, all functions no-op and return null/empty.
 */

import { Pool, type PoolClient } from 'pg';
import type { TimeseriesPoint } from '../services/portfolioService';

let pool: Pool | null = null;
let schemaInitialized = false;

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

const SCHEMA_SQL = `
create table if not exists portfolio_users (
  chain text not null,
  user_address text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (chain, user_address)
);

create table if not exists portfolio_daily_snapshots (
  chain text not null,
  user_address text not null,
  day_ts bigint not null,
  equity_usd numeric not null,
  cum_deposited_usd numeric not null,
  cum_withdrawn_usd numeric not null default 0,
  pnl_usd numeric not null,
  drawdown_pct numeric,
  method text not null default 'snapshotted_daily_equity',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (chain, user_address, day_ts)
);

create table if not exists portfolio_snapshot_runs (
  id uuid primary key default gen_random_uuid(),
  chain text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  users_processed int not null default 0,
  success_count int not null default 0,
  failed_count int not null default 0,
  duration_ms bigint,
  error text
);

create index if not exists idx_snapshot_runs_chain_started_at
on portfolio_snapshot_runs (chain, started_at desc);

create table if not exists ai_prediction_logs (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  chain text not null,
  pair_address text not null,
  created_at timestamptz not null default now(),
  horizon_sec int not null,
  model text,
  signal text,
  confidence numeric,
  entry_price_usd numeric,
  features jsonb,
  reason text,
  alert_context jsonb,
  resolved_at timestamptz,
  exit_price_usd numeric,
  return_pct numeric,
  correct boolean
);

create index if not exists idx_ai_prediction_logs_pair_created
on ai_prediction_logs (pair_address, created_at desc);

alter table ai_prediction_logs add column if not exists external_id text;

create unique index if not exists idx_ai_prediction_logs_external_id
on ai_prediction_logs (external_id)
where external_id is not null;
`;

export async function initSchema(): Promise<void> {
  const p = getPool();
  if (!p || schemaInitialized) return;
  try {
    await p.query(SCHEMA_SQL);
    schemaInitialized = true;
    console.log('[portfolioDb] Schema initialized');
  } catch (err) {
    console.error('[portfolioDb] Schema init failed:', err);
  }
}

/** Touch user (upsert portfolio_users). Fire-and-forget. */
export function touchUser(chain: 'evm' | 'solana', userAddress: string): void {
  const p = getPool();
  if (!p) return;
  initSchema()
    .then(() =>
      p.query(
        `insert into portfolio_users (chain, user_address, first_seen_at, last_seen_at)
         values ($1, $2, now(), now())
         on conflict (chain, user_address)
         do update set last_seen_at = now()`,
        [chain, userAddress]
      )
    )
    .catch((err) => console.warn('[portfolioDb] touchUser failed:', err));
}

/** Get snapshots in range. Returns null if DB unavailable or error. */
export async function getSnapshots(
  chain: 'evm' | 'solana',
  userAddress: string,
  fromDayTs: number,
  toDayTs: number
): Promise<TimeseriesPoint[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    await initSchema();
    const res = await p.query<{
      day_ts: string;
      equity_usd: string;
      cum_deposited_usd: string;
      cum_withdrawn_usd: string;
      pnl_usd: string;
      drawdown_pct: string | null;
    }>(
      `select day_ts, equity_usd, cum_deposited_usd, cum_withdrawn_usd, pnl_usd, drawdown_pct
       from portfolio_daily_snapshots
       where chain = $1 and user_address = $2 and day_ts >= $3 and day_ts <= $4
       order by day_ts`,
      [chain, userAddress, fromDayTs, toDayTs]
    );
    return res.rows.map((r) => {
      const pt: TimeseriesPoint = {
        ts: Number(r.day_ts),
        equityUsd: parseFloat(r.equity_usd),
        pnlUsd: parseFloat(r.pnl_usd),
      };
      if (r.drawdown_pct != null) pt.drawdownPct = parseFloat(r.drawdown_pct);
      return pt;
    });
  } catch (err) {
    console.warn('[portfolioDb] getSnapshots failed:', err);
    return null;
  }
}

export interface SnapshotRow {
  chain: 'evm' | 'solana';
  userAddress: string;
  dayTs: number;
  equityUsd: number;
  cumDepositedUsd: number;
  cumWithdrawnUsd: number;
  pnlUsd: number;
  drawdownPct?: number;
}

/** Upsert a snapshot row. */
export async function upsertSnapshot(row: SnapshotRow): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await initSchema();
    await p.query(
      `insert into portfolio_daily_snapshots
       (chain, user_address, day_ts, equity_usd, cum_deposited_usd, cum_withdrawn_usd, pnl_usd, drawdown_pct, method)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'snapshotted_daily_equity')
       on conflict (chain, user_address, day_ts)
       do update set
         equity_usd = excluded.equity_usd,
         cum_deposited_usd = excluded.cum_deposited_usd,
         cum_withdrawn_usd = excluded.cum_withdrawn_usd,
         pnl_usd = excluded.pnl_usd,
         drawdown_pct = excluded.drawdown_pct,
         updated_at = now()`,
      [
        row.chain,
        row.userAddress,
        row.dayTs,
        row.equityUsd,
        row.cumDepositedUsd,
        row.cumWithdrawnUsd,
        row.pnlUsd,
        row.drawdownPct ?? null,
      ]
    );
    return true;
  } catch (err) {
    console.warn('[portfolioDb] upsertSnapshot failed:', err);
    return false;
  }
}

/** Get active users for snapshot job. Optional limit to avoid runaway jobs. */
export async function getActiveUsers(
  chain: 'evm' | 'solana',
  daysBack: number,
  limit?: number
): Promise<string[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await initSchema();
    const limitClause = limit != null && limit > 0 ? `limit ${Math.min(limit, 10000)}` : '';
    const res = await p.query<{ user_address: string }>(
      `select user_address from portfolio_users
       where chain = $1 and last_seen_at > now() - ($2::text || ' days')::interval
       order by last_seen_at desc ${limitClause}`,
      [chain, String(daysBack)]
    );
    return res.rows.map((r) => r.user_address);
  } catch (err) {
    console.warn('[portfolioDb] getActiveUsers failed:', err);
    return [];
  }
}

/**
 * Run a job with an advisory lock to prevent concurrent snapshot runs.
 * Returns { acquired: false } if lock could not be acquired (409 case).
 */
export async function runWithSnapshotLock<T>(
  chain: 'evm' | 'solana',
  fn: () => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const p = getPool();
  if (!p) return { acquired: false };
  const client: PoolClient = await p.connect();
  const lockKey = chain === 'evm' ? 0x534e415001 : 0x534e415002; // SNAP + 1|2
  try {
    await initSchema();
    const res = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [lockKey]);
    if (!res.rows[0]?.locked) return { acquired: false };
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await client.query('select pg_advisory_unlock($1)', [lockKey]).catch(() => {});
    client.release();
  }
}

export function isDbAvailable(): boolean {
  return getPool() != null;
}

export interface SnapshotRunRow {
  id: string;
  chain: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  usersProcessed: number;
  successCount: number;
  failedCount: number;
  durationMs: number | null;
  error: string | null;
}

export interface PredictionInput {
  externalId?: string;
  chain: 'solana' | 'evm';
  pairAddress: string;
  horizonSec: number;
  model?: string;
  signal?: string;
  confidence?: number;
  entryPriceUsd?: number;
  features?: Record<string, unknown>;
  reason?: string;
  alertContext?: Record<string, unknown>;
}

export interface PredictionRow {
  id: string;
  chain: string;
  pairAddress: string;
  createdAt: Date;
  horizonSec: number;
  model?: string | null;
  signal?: string | null;
  confidence?: number | null;
  entryPriceUsd?: number | null;
  resolvedAt?: Date | null;
  exitPriceUsd?: number | null;
  returnPct?: number | null;
  correct?: boolean | null;
}

export async function insertPrediction(row: PredictionInput): Promise<string | null> {
  const p = getPool();
  if (!p) return null;
  try {
    await initSchema();
    const res = await p.query<{ id: string }>(
      `insert into ai_prediction_logs
       (external_id, chain, pair_address, horizon_sec, model, signal, confidence, entry_price_usd, features, reason, alert_context)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (external_id) do nothing
       returning id`,
      [
        row.externalId ?? null,
        row.chain,
        row.pairAddress,
        row.horizonSec,
        row.model ?? null,
        row.signal ?? null,
        row.confidence ?? null,
        row.entryPriceUsd ?? null,
        row.features ?? null,
        row.reason ?? null,
        row.alertContext ?? null,
      ]
    );
    if (res.rows[0]?.id) return res.rows[0].id;

    if (row.externalId) {
      const existing = await p.query<{ id: string }>(
        'select id from ai_prediction_logs where external_id = $1 limit 1',
        [row.externalId]
      );
      return existing.rows[0]?.id ?? null;
    }

    return null;
  } catch (err) {
    console.warn('[portfolioDb] insertPrediction failed:', err);
    return null;
  }
}

export async function listPredictions(
  pairAddress: string | null,
  window: string,
  limit: number
): Promise<PredictionRow[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await initSchema();
    const limitSafe = Math.min(Math.max(limit, 1), 500);
    const windowClause = windowToInterval(window);
    const params: Array<string | number> = [];
    let where = 'created_at >= now() - ' + windowClause;
    if (pairAddress) {
      params.push(pairAddress);
      where += ` and pair_address = $${params.length}`;
    }
    const res = await p.query(
      `select id, chain, pair_address, created_at, horizon_sec, model, signal, confidence, entry_price_usd,
              resolved_at, exit_price_usd, return_pct, correct
       from ai_prediction_logs
       where ${where}
       order by created_at desc
       limit ${limitSafe}`,
      params
    );
    return res.rows.map((r: any) => ({
      id: r.id,
      chain: r.chain,
      pairAddress: r.pair_address,
      createdAt: r.created_at,
      horizonSec: Number(r.horizon_sec),
      model: r.model,
      signal: r.signal,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      entryPriceUsd: r.entry_price_usd != null ? Number(r.entry_price_usd) : null,
      resolvedAt: r.resolved_at,
      exitPriceUsd: r.exit_price_usd != null ? Number(r.exit_price_usd) : null,
      returnPct: r.return_pct != null ? Number(r.return_pct) : null,
      correct: r.correct,
    }));
  } catch (err) {
    console.warn('[portfolioDb] listPredictions failed:', err);
    return [];
  }
}

export async function listPendingPredictions(pairAddress?: string, chain?: string): Promise<PredictionRow[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await initSchema();
    const params: Array<string> = [];
    let where = 'resolved_at is null';
    if (pairAddress) {
      params.push(pairAddress);
      where += ` and pair_address = $${params.length}`;
    }
    if (chain) {
      params.push(chain);
      where += ` and chain = $${params.length}`;
    }
    const res = await p.query(
      `select id, chain, pair_address, created_at, horizon_sec, signal, entry_price_usd
       from ai_prediction_logs
       where ${where}
       order by created_at asc
       limit 500`,
      params
    );
    return res.rows.map((r: any) => ({
      id: r.id,
      chain: r.chain,
      pairAddress: r.pair_address,
      createdAt: r.created_at,
      horizonSec: Number(r.horizon_sec),
      signal: r.signal,
      entryPriceUsd: r.entry_price_usd != null ? Number(r.entry_price_usd) : null,
    }));
  } catch (err) {
    console.warn('[portfolioDb] listPendingPredictions failed:', err);
    return [];
  }
}

export async function updatePredictionResult(
  id: string,
  result: { resolvedAt: Date; exitPriceUsd: number; returnPct: number; correct: boolean }
): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await initSchema();
    await p.query(
      `update ai_prediction_logs
       set resolved_at = $2,
           exit_price_usd = $3,
           return_pct = $4,
           correct = $5
       where id = $1`,
      [id, result.resolvedAt, result.exitPriceUsd, result.returnPct, result.correct]
    );
    return true;
  } catch (err) {
    console.warn('[portfolioDb] updatePredictionResult failed:', err);
    return false;
  }
}

export async function getPredictionAccuracy(pairAddress: string | null, window: string): Promise<any[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await initSchema();
    const windowClause = windowToInterval(window);
    const params: Array<string> = [];
    let where = `created_at >= now() - ${windowClause}`;
    if (pairAddress) {
      params.push(pairAddress);
      where += ` and pair_address = $${params.length}`;
    }
    const res = await p.query(
      `select horizon_sec, model,
              count(*)::int as total,
              count(resolved_at)::int as resolved,
              avg(return_pct) as avg_return_pct,
              percentile_cont(0.5) within group (order by return_pct) as median_return_pct,
              avg(confidence) as avg_confidence,
              sum(case when correct then 1 else 0 end)::float / nullif(count(resolved_at), 0) as hit_rate
       from ai_prediction_logs
       where ${where}
       group by horizon_sec, model
       order by horizon_sec asc`,
      params
    );
    return res.rows;
  } catch (err) {
    console.warn('[portfolioDb] getPredictionAccuracy failed:', err);
    return [];
  }
}

function windowToInterval(window: string): string {
  const v = window.trim().toLowerCase();
  if (v.endsWith('h')) return `(${Number(v.replace('h', ''))} || ' hours')::interval`;
  if (v.endsWith('d')) return `(${Number(v.replace('d', ''))} || ' days')::interval`;
  return "('24' || ' hours')::interval";
}

/** Insert a started run record. Returns the run id. */
export async function insertSnapshotRun(chain: 'evm' | 'solana'): Promise<string | null> {
  const p = getPool();
  if (!p) return null;
  try {
    await initSchema();
    const res = await p.query<{ id: string }>(
      `insert into portfolio_snapshot_runs (chain, started_at) values ($1, now()) returning id`,
      [chain]
    );
    return res.rows[0]?.id ?? null;
  } catch (err) {
    console.warn('[portfolioDb] insertSnapshotRun failed:', err);
    return null;
  }
}

/** Update a run record on completion. */
export async function updateSnapshotRun(
  runId: string,
  opts: {
    ok: boolean;
    usersProcessed: number;
    successCount: number;
    failedCount: number;
    durationMs: number;
    error?: string | null;
  }
): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(
      `update portfolio_snapshot_runs set finished_at = now(), ok = $1, users_processed = $2, success_count = $3, failed_count = $4, duration_ms = $5, error = $6 where id = $7`,
      [opts.ok, opts.usersProcessed, opts.successCount, opts.failedCount, opts.durationMs, opts.error ?? null, runId]
    );
  } catch (err) {
    console.warn('[portfolioDb] updateSnapshotRun failed:', err);
  }
}

/** Delete snapshot runs older than retentionDays. Returns number deleted. */
export async function cleanupSnapshotRuns(retentionDays = 90): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  try {
    await initSchema();
    const res = await p.query<{ count: string }>(
      `with deleted as (
         delete from portfolio_snapshot_runs
         where started_at < now() - ($1::text || ' days')::interval
         returning id
       )
       select count(*)::text as count from deleted`,
      [String(Math.max(1, retentionDays))]
    );
    const n = parseInt(res.rows[0]?.count ?? '0', 10);
    if (n > 0) {
      console.log(`[portfolioDb] cleanupSnapshotRuns: deleted ${n} runs older than ${retentionDays}d`);
    }
    return n;
  } catch (err) {
    console.warn('[portfolioDb] cleanupSnapshotRuns failed:', err);
    return 0;
  }
}

/** Get the last run for a chain. Returns null if DB unavailable or no runs. */
export async function getLastSnapshotRun(chain: 'evm' | 'solana'): Promise<SnapshotRunRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    await initSchema();
    const res = await p.query<{
      id: string;
      chain: string;
      started_at: Date;
      finished_at: Date | null;
      ok: boolean | null;
      users_processed: string;
      success_count: string;
      failed_count: string;
      duration_ms: string | null;
      error: string | null;
    }>(
      `select id, chain, started_at, finished_at, ok, users_processed, success_count, failed_count, duration_ms, error
       from portfolio_snapshot_runs where chain = $1 order by started_at desc limit 1`,
      [chain]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      chain: r.chain,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      ok: r.ok,
      usersProcessed: parseInt(r.users_processed, 10) || 0,
      successCount: parseInt(r.success_count, 10) || 0,
      failedCount: parseInt(r.failed_count, 10) || 0,
      durationMs: r.duration_ms != null ? parseInt(r.duration_ms, 10) : null,
      error: r.error,
    };
  } catch (err) {
    console.warn('[portfolioDb] getLastSnapshotRun failed:', err);
    return null;
  }
}
