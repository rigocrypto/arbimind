/**
 * Tests for initSchema() singleton/concurrency behaviour in portfolioDb.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

import { initSchema, _resetSchemaState } from '../db/portfolioDb';

beforeEach(() => {
  _resetSchemaState();
  mockQuery.mockReset();
  process.env.DATABASE_URL = 'postgres://localhost/test';
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe('initSchema singleton', () => {
  it('executes schema SQL exactly once on first call', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await initSchema();

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('skips execution on subsequent calls after success', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await initSchema();
    await initSchema();
    await initSchema();

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('concurrent calls execute schema SQL only once', async () => {
    let resolveQuery!: () => void;
    mockQuery.mockImplementation(
      () => new Promise<{ rows: never[] }>((resolve) => {
        resolveQuery = () => resolve({ rows: [] });
      })
    );

    const p1 = initSchema();
    const p2 = initSchema();
    const p3 = initSchema();

    // All three should share the same promise; query called once
    expect(mockQuery).toHaveBeenCalledTimes(1);

    resolveQuery();
    await Promise.all([p1, p2, p3]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('retries on transient deadlock (40P01) and succeeds', async () => {
    const deadlockErr = Object.assign(new Error('deadlock'), { code: '40P01' });
    mockQuery
      .mockRejectedValueOnce(deadlockErr)
      .mockResolvedValueOnce({ rows: [] });

    await initSchema();

    expect(mockQuery).toHaveBeenCalledTimes(2);

    // Subsequent call should be a no-op (schema marked initialized)
    await initSchema();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('does nothing when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL;
    _resetSchemaState();

    await initSchema();

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
