import express from 'express';
import request from 'supertest';

jest.mock('../utils/rpc', () => ({
  checkRpcHealth: jest.fn().mockImplementation((chain: string) => {
    const results: Record<string, unknown> = {
      evm: { chain: 'evm', status: 'healthy', rpcUrl: 'https://rpc-amoy.polygon.technology', latencyMs: 145 },
      solana: { chain: 'solana', status: 'healthy', rpcUrl: 'https://beta.helius-rpc.com', latencyMs: 89 },
      worldchain_sepolia: { chain: 'worldchain_sepolia', status: 'unavailable', rpcUrl: null, error: 'RPC URL not configured' },
    };
    return Promise.resolve(results[chain] ?? { chain, status: 'unavailable', rpcUrl: null, error: 'unknown chain' });
  }),
}));

import rpcRoutes from '../routes/rpc';

function createApp() {
  const app = express();
  app.use('/api/rpc', rpcRoutes);
  return app;
}

describe('GET /api/rpc/health', () => {
  it('returns per-chain health for all default chains', async () => {
    const res = await request(createApp()).get('/api/rpc/health');

    // 503 because worldchain_sepolia is unavailable
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.details).toHaveProperty('evm');
    expect(res.body.details).toHaveProperty('solana');
    expect(res.body.details).toHaveProperty('worldchain_sepolia');

    expect(res.body.details.evm).toMatchObject({ status: 'healthy', latencyMs: 145 });
    expect(res.body.details.solana).toMatchObject({ status: 'healthy', latencyMs: 89 });
    expect(res.body.details.worldchain_sepolia).toMatchObject({ status: 'unavailable', error: 'RPC URL not configured' });
  });

  it('returns only requested chains via ?chain= query', async () => {
    const res = await request(createApp()).get('/api/rpc/health?chain=evm,solana');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Object.keys(res.body.details)).toHaveLength(2);
    expect(res.body.details).toHaveProperty('evm');
    expect(res.body.details).toHaveProperty('solana');
    expect(res.body.details).not.toHaveProperty('worldchain_sepolia');
  });

  it('includes latencyMs in details for healthy chains', async () => {
    const res = await request(createApp()).get('/api/rpc/health?chain=evm');

    expect(res.status).toBe(200);
    expect(res.body.details.evm.latencyMs).toBe(145);
  });
});
