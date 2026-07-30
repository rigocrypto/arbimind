/**
 * Route-level contract for database failures (#370).
 *
 * The regressions these lock down:
 *   - /api/snapshots/health returned `{ok: true, stale: true}` while the
 *     database was unreachable, so it passed post-deploy smoke throughout a
 *     total outage.
 *   - /api/analytics/ab-cta returned a bare 500 for every failure, giving no
 *     way to tell "not configured" from "unreachable" from "broken query".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import express from 'express';
import request from 'supertest';

jest.mock('../db/portfolioDb', () => ({
  getCtaAbReportResult: jest.fn(),
  insertFunnelEventResult: jest.fn(),
  listFunnelEventsResult: jest.fn(),
  getLastSnapshotRunResult: jest.fn(),
}));

import analyticsRoutes from '../routes/analytics';
import snapshotsRoutes from '../routes/snapshots';
import {
  getCtaAbReportResult,
  listFunnelEventsResult,
  getLastSnapshotRunResult,
} from '../db/portfolioDb';

const mockCtaReport = getCtaAbReportResult as jest.MockedFunction<any>;
const mockListEvents = listFunnelEventsResult as jest.MockedFunction<any>;
const mockLastRun = getLastSnapshotRunResult as jest.MockedFunction<any>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/snapshots', snapshotsRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('analytics — DB unconfigured', () => {
  it('returns 503 with dbStatus=unconfigured', async () => {
    mockCtaReport.mockResolvedValue({
      ok: false,
      kind: 'unconfigured',
      message: 'DATABASE_URL is not set',
    });

    const res = await request(buildApp()).get('/api/analytics/ab-cta?window=7d');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, dbStatus: 'unconfigured' });
  });
});

describe('analytics — DB unreachable', () => {
  it('returns a controlled 503, not a generic 500', async () => {
    mockCtaReport.mockResolvedValue({
      ok: false,
      kind: 'unreachable',
      message: 'getaddrinfo ENOTFOUND postgres.railway.internal',
      code: 'ENOTFOUND',
    });

    const res = await request(buildApp()).get('/api/analytics/ab-cta?window=7d');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, dbStatus: 'unreachable', code: 'ENOTFOUND' });
  });

  it('does not leak the internal hostname to unauthenticated clients', async () => {
    mockCtaReport.mockResolvedValue({
      ok: false,
      kind: 'unreachable',
      message: 'getaddrinfo ENOTFOUND postgres.railway.internal',
      code: 'ENOTFOUND',
    });

    const res = await request(buildApp()).get('/api/analytics/ab-cta?window=7d');

    expect(JSON.stringify(res.body)).not.toContain('postgres.railway.internal');
  });

  it('applies the same handling to the events listing', async () => {
    mockListEvents.mockResolvedValue({
      ok: false,
      kind: 'unreachable',
      message: 'Connection terminated',
    });

    const res = await request(buildApp()).get('/api/analytics/events?limit=1');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ dbStatus: 'unreachable' });
  });
});

describe('analytics — query failure', () => {
  it('returns 500 with dbStatus=query_failed, distinct from unavailability', async () => {
    mockCtaReport.mockResolvedValue({
      ok: false,
      kind: 'query_failed',
      message: 'column "cta_variant" does not exist',
      code: '42703',
    });

    const res = await request(buildApp()).get('/api/analytics/ab-cta?window=7d');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ dbStatus: 'query_failed', code: '42703' });
  });
});

describe('analytics — success', () => {
  it('returns 200 with zeroed variants for an empty window', async () => {
    const emptyVariant = {
      landings: 0,
      connectClicks: 0,
      walletConnected: 0,
      connectRatePct: 0,
      clickRatePct: 0,
      bounceRatePct: 0,
      usesSessionIds: false,
    };
    mockCtaReport.mockResolvedValue({
      ok: true,
      value: {
        window: '7d',
        variants: [
          { variant: 'A', ...emptyVariant },
          { variant: 'B', ...emptyVariant },
        ],
        winner: null,
        deltaConnectRatePct: 0,
      },
    });

    const res = await request(buildApp()).get('/api/analytics/ab-cta?window=7d');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.variants).toHaveLength(2);
  });
});

describe('snapshots health — the false-positive regression', () => {
  it('does NOT report ok:true when the database is unreachable', async () => {
    mockLastRun.mockResolvedValue({
      ok: false,
      kind: 'unreachable',
      message: 'getaddrinfo ENOTFOUND postgres.railway.internal',
      code: 'ENOTFOUND',
    });

    const res = await request(buildApp()).get('/api/snapshots/health?chain=evm');

    // The exact regression: previously 200 {ok:true, stale:true}.
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body).toMatchObject({ dbStatus: 'unreachable' });
  });

  it('returns 503 when the database is unconfigured', async () => {
    mockLastRun.mockResolvedValue({
      ok: false,
      kind: 'unconfigured',
      message: 'DATABASE_URL is not set',
    });

    const res = await request(buildApp()).get('/api/snapshots/health?chain=evm');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, dbStatus: 'unconfigured' });
  });

  it('still reports stale:true when the DB is reachable but has no runs', async () => {
    mockLastRun.mockResolvedValue({ ok: true, value: null });

    const res = await request(buildApp()).get('/api/snapshots/health?chain=evm');

    // Legitimate signal: reached the database, nothing recorded yet.
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      lastRunAt: null,
      stale: true,
      dbStatus: 'reachable',
    });
  });

  it('reports a recent run as not stale', async () => {
    const now = new Date();
    mockLastRun.mockResolvedValue({
      ok: true,
      value: {
        id: 'run-1',
        chain: 'evm',
        startedAt: now,
        finishedAt: now,
        ok: true,
        usersProcessed: 3,
        successCount: 3,
        failedCount: 0,
        durationMs: 120,
        error: null,
      },
    });

    const res = await request(buildApp()).get('/api/snapshots/health?chain=evm');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.stale).toBe(false);
  });
});
