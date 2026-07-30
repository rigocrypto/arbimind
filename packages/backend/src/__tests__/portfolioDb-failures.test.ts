/**
 * Tests for structured DB failure reporting in portfolioDb.
 *
 * The bug these guard against (#370): every failure was collapsed into `null`,
 * so callers could not tell "database unreachable" from "no rows". That made a
 * total outage render as a healthy empty result.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockQuery = jest.fn();
const mockEnd = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();
const poolConstructor = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation((...args: unknown[]) => {
    poolConstructor(...args);
    return { query: mockQuery, end: mockEnd, on: mockOn };
  }),
}));

import {
  getCtaAbReportResult,
  getLastSnapshotRunResult,
  listFunnelEventsResult,
  getDbBootDiagnostics,
  _resetSchemaState,
} from '../db/portfolioDb';

const SCHEMA_OK = { rows: [] };

function connectionError(code: string, message = 'connection failure') {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  _resetSchemaState();
  mockQuery.mockReset();
  mockEnd.mockClear();
  mockOn.mockClear();
  poolConstructor.mockClear();
  process.env.DATABASE_URL = 'postgres://user:pw@localhost:5432/testdb';
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe('unconfigured database', () => {
  it('reports kind=unconfigured when DATABASE_URL is unset', async () => {
    delete process.env.DATABASE_URL;
    _resetSchemaState();

    const result = await getCtaAbReportResult('7d');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ kind: 'unconfigured' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only DATABASE_URL as unconfigured', async () => {
    process.env.DATABASE_URL = '   ';
    _resetSchemaState();

    const result = await getLastSnapshotRunResult('evm');

    expect(result).toMatchObject({ ok: false, kind: 'unconfigured' });
  });
});

describe('unreachable database', () => {
  it.each([
    ['ENOTFOUND', 'getaddrinfo ENOTFOUND postgres.railway.internal'],
    ['ECONNREFUSED', 'connect ECONNREFUSED 10.0.0.1:5432'],
    ['57P01', 'terminating connection due to administrator command'],
    ['08006', 'connection failure'],
  ])('classifies %s as unreachable, not query_failed', async (code, message) => {
    mockQuery.mockRejectedValue(connectionError(code, message));

    const result = await getCtaAbReportResult('7d');

    expect(result).toMatchObject({ ok: false, kind: 'unreachable' });
  });

  it('classifies a terminated-connection message with no code as unreachable', async () => {
    mockQuery.mockRejectedValue(new Error('Connection terminated unexpectedly'));

    const result = await getCtaAbReportResult('7d');

    expect(result).toMatchObject({ ok: false, kind: 'unreachable' });
  });

  it('discards the pool so the retry does not reuse a dead connection', async () => {
    mockQuery.mockRejectedValue(connectionError('ECONNRESET'));

    await getCtaAbReportResult('7d');

    // Pool rebuilt on each attempt after being reset.
    expect(mockEnd).toHaveBeenCalled();
    expect(poolConstructor.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('recovery', () => {
  it('recovers when a stale pooled connection fails once then succeeds', async () => {
    mockQuery
      .mockRejectedValueOnce(connectionError('ECONNRESET', 'Connection terminated'))
      .mockResolvedValue(SCHEMA_OK); // schema init + report query

    const result = await getCtaAbReportResult('7d');

    expect(result.ok).toBe(true);
  });

  it('retries a transient serialization failure (40001)', async () => {
    mockQuery
      .mockResolvedValueOnce(SCHEMA_OK) // schema init
      .mockRejectedValueOnce(connectionError('40001', 'could not serialize access'))
      .mockResolvedValue(SCHEMA_OK); // retried report query

    const result = await getCtaAbReportResult('7d');

    expect(result.ok).toBe(true);
  });
});

describe('permanent query failures stay visible', () => {
  it('reports kind=query_failed and preserves the SQLSTATE', async () => {
    mockQuery
      .mockResolvedValueOnce(SCHEMA_OK) // schema init
      .mockRejectedValue(connectionError('42703', 'column "cta_variant" does not exist'));

    const result = await getCtaAbReportResult('7d');

    expect(result).toMatchObject({ ok: false, kind: 'query_failed', code: '42703' });
    expect((result as any).message).toContain('cta_variant');
  });

  it('does not retry a permanent failure', async () => {
    mockQuery
      .mockResolvedValueOnce(SCHEMA_OK)
      .mockRejectedValue(connectionError('42703', 'column does not exist'));

    await getCtaAbReportResult('7d');

    // schema init + exactly one report attempt
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('reachable database', () => {
  it('distinguishes "no rows" from a failure for snapshot runs', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getLastSnapshotRunResult('evm');

    // ok:true with a null value means "reached the DB, nothing recorded" —
    // which callers must render differently from an outage.
    expect(result).toEqual({ ok: true, value: null });
  });

  it('returns an empty list rather than a failure when no events exist', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await listFunnelEventsResult(10);

    expect(result).toEqual({ ok: true, value: [] });
  });
});

describe('getDbBootDiagnostics', () => {
  it('reports host and database without leaking credentials', () => {
    process.env.DATABASE_URL = 'postgresql://someuser:supersecret@db.internal:5432/appdb';

    const diag = getDbBootDiagnostics();

    expect(diag).toEqual({ configured: true, host: 'db.internal:5432', database: 'appdb' });
    expect(JSON.stringify(diag)).not.toContain('supersecret');
    expect(JSON.stringify(diag)).not.toContain('someuser');
  });

  it('reports unconfigured when DATABASE_URL is absent', () => {
    delete process.env.DATABASE_URL;

    expect(getDbBootDiagnostics()).toEqual({
      configured: false,
      host: 'NONE',
      database: 'NONE',
    });
  });

  it('flags a malformed URL without echoing it', () => {
    process.env.DATABASE_URL = 'not-a-url';

    const diag = getDbBootDiagnostics();

    expect(diag.configured).toBe(true);
    expect(diag.host).toBe('UNPARSEABLE');
    expect(JSON.stringify(diag)).not.toContain('not-a-url');
  });
});
