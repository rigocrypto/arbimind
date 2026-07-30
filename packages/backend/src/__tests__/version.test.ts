/**
 * /api/version must actually verify the running deployment.
 *
 * Regression (#370): `startedAt` was `new Date().toISOString()` evaluated per
 * request, so it always returned "now". Two calls seconds apart reported two
 * different start times, and a 15-hour-old container looked freshly booted —
 * which is precisely what made several attempted fixes unverifiable.
 */

import express from 'express';
import request from 'supertest';

import versionRoutes from '../routes/version';

function buildApp() {
  const app = express();
  app.use('/api/version', versionRoutes);
  return app;
}

describe('GET /api/version', () => {
  it('returns a stable startedAt across calls', async () => {
    const app = buildApp();

    const first = await request(app).get('/api/version');
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = await request(app).get('/api/version');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.startedAt).toBe(second.body.startedAt);
  });

  it('reports a startedAt in the past, not the current instant', async () => {
    const res = await request(buildApp()).get('/api/version');

    const startedAt = new Date(res.body.startedAt).getTime();
    expect(Number.isNaN(startedAt)).toBe(false);
    // Derived from process.uptime(), so it must predate the request.
    expect(startedAt).toBeLessThan(Date.now());
  });

  it('exposes uptimeSeconds for deploy-age checks', async () => {
    const res = await request(buildApp()).get('/api/version');

    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports node version and a sha field', async () => {
    const res = await request(buildApp()).get('/api/version');

    expect(res.body.ok).toBe(true);
    expect(res.body.node).toBe(process.version);
    expect(typeof res.body.sha).toBe('string');
  });
});
