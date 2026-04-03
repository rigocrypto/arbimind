import express from 'express';
import request from 'supertest';

import engineRoutes from '../routes/engine';

// Enable simulated engine for functional tests
beforeAll(() => {
  process.env.SIMULATED_ENGINE_ENABLED = 'true';
});

afterAll(() => {
  delete process.env.SIMULATED_ENGINE_ENABLED;
});

describe('GET /engine/status', () => {
  const app = express();

  beforeAll(() => {
    app.use(express.json());
    app.use('/engine', engineRoutes);
  });

  afterEach(async () => {
    await request(app).post('/engine/stop');
  });

  it('returns idle state when engine is not running', async () => {
    const res = await request(app).get('/engine/status');

    expect(res.status).toBe(200);
    expect(res.body.active).toBe('');
    expect(Boolean(res.body.active)).toBe(false);
  });

  it('returns running state and expected shape after engine start', async () => {
    const start = await request(app).post('/engine/start').send({ strategy: 'arbitrage' });
    expect(start.status).toBe(200);

    const res = await request(app).get('/engine/status');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      active: expect.any(String),
      oppsCount: expect.any(Number),
      lastProfit: expect.any(Number),
      lastScanAt: null,
      uptime: expect.any(Number),
      timestamp: expect.any(Number),
    });
    expect(res.body.active).toBe('arbitrage');
    expect(Boolean(res.body.active)).toBe(true);
  });
});

describe('POST /engine/start guard', () => {
  const app = express();

  beforeAll(() => {
    app.use(express.json());
    app.use('/engine', engineRoutes);
  });

  afterEach(async () => {
    await request(app).post('/engine/stop');
    process.env.SIMULATED_ENGINE_ENABLED = 'true'; // restore for other tests
  });

  it('returns 403 when SIMULATED_ENGINE_ENABLED is not set', async () => {
    delete process.env.SIMULATED_ENGINE_ENABLED;
    const res = await request(app).post('/engine/start').send({ strategy: 'arbitrage' });
    expect(res.status).toBe(403);
    expect(res.body.status).toBe('blocked');
  });

  it('returns 403 when SIMULATED_ENGINE_ENABLED is "false"', async () => {
    process.env.SIMULATED_ENGINE_ENABLED = 'false';
    const res = await request(app).post('/engine/start').send({ strategy: 'arbitrage' });
    expect(res.status).toBe(403);
  });

  it('allows start when SIMULATED_ENGINE_ENABLED is "true"', async () => {
    process.env.SIMULATED_ENGINE_ENABLED = 'true';
    const res = await request(app).post('/engine/start').send({ strategy: 'arbitrage' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('returns idempotent success for duplicate start of same strategy', async () => {
    process.env.SIMULATED_ENGINE_ENABLED = 'true';
    const first = await request(app).post('/engine/start').send({ strategy: 'arbitrage' });
    expect(first.status).toBe(200);
    expect(first.body.idempotent).toBeUndefined();

    const second = await request(app).post('/engine/start').send({ strategy: 'arbitrage' });
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
  });

  it('restarts when switching strategies', async () => {
    process.env.SIMULATED_ENGINE_ENABLED = 'true';
    const first = await request(app).post('/engine/start').send({ strategy: 'arbitrage' });
    expect(first.status).toBe(200);

    const second = await request(app).post('/engine/start').send({ strategy: 'market-making' });
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBeUndefined();
    expect(second.body.strategy).toBe('market-making');
  });
});
