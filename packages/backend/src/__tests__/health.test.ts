import express from 'express';
import request from 'supertest';

import healthRoutes from '../routes/health';

describe('GET /healthz', () => {
  it('returns 200 and a healthy status payload', async () => {
    const app = express();
    app.use('/healthz', healthRoutes);

    const res = await request(app).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        status: 'healthy',
      })
    );
  });
});
