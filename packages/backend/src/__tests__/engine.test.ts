import express from 'express';
import request from 'supertest';

import engineRoutes from '../routes/engine';

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
