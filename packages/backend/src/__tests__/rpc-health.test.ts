import express from 'express';
import request from 'supertest';

// Mock only checkRpcHealth. redactRpcUrl keeps its real implementation so these
// tests exercise the actual redaction rather than a stand-in for it.
jest.mock('../utils/rpc', () => {
  const actual = jest.requireActual('../utils/rpc');
  return {
    ...actual,
    checkRpcHealth: jest.fn().mockImplementation((chain: string) => {
      // Shaped like real provider URLs: each embeds its API key in the path or
      // query string, which is what made this endpoint leak.
      const results: Record<string, unknown> = {
        evm: {
          chain: 'evm',
          status: 'healthy',
          rpcUrl: 'https://arbitrum-mainnet.infura.io/v3/FAKE-PROJECT-ID-FOR-TESTS-ONLY',
          latencyMs: 145,
        },
        solana: {
          chain: 'solana',
          status: 'healthy',
          rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=FAKE-HELIUS-KEY-FOR-TESTS-ONLY',
          latencyMs: 89,
        },
        worldchain_sepolia: {
          chain: 'worldchain_sepolia',
          status: 'unavailable',
          rpcUrl: null,
          error: 'RPC URL not configured',
        },
      };
      return Promise.resolve(results[chain] ?? { chain, status: 'unavailable', rpcUrl: null, error: 'unknown chain' });
    }),
  };
});

import rpcRoutes from '../routes/rpc';
import { redactRpcUrl } from '../utils/rpc';

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

describe('GET /api/rpc/health does not leak provider API keys', () => {
  // This endpoint is public and unauthenticated. It previously returned the full
  // rpcUrl, publishing the Infura project id, Helius api-key and Alchemy key to
  // any caller -- and would have republished any rotated key on next deploy.

  it('never includes the API key anywhere in the response body', async () => {
    const res = await request(createApp()).get('/api/rpc/health');
    const body = JSON.stringify(res.body);

    expect(body).not.toContain('FAKE-PROJECT-ID-FOR-TESTS-ONLY');
    expect(body).not.toContain('FAKE-HELIUS-KEY-FOR-TESTS-ONLY');
    // The path segments that carry keys must not appear at all.
    expect(body).not.toMatch(/\/v3\//);
    expect(body).not.toMatch(/api-key=/);
  });

  it('exposes rpcHost, not rpcUrl', async () => {
    const res = await request(createApp()).get('/api/rpc/health?chain=evm');

    expect(res.body.details.evm).not.toHaveProperty('rpcUrl');
    expect(res.body.details.evm.rpcHost).toBe('arbitrum-mainnet.infura.io');
  });

  it('keeps the host useful for diagnosis', async () => {
    const res = await request(createApp()).get('/api/rpc/health?chain=evm,solana');

    // Enough to identify the provider and confirm which endpoint is configured.
    expect(res.body.details.evm.rpcHost).toBe('arbitrum-mainnet.infura.io');
    expect(res.body.details.solana.rpcHost).toBe('mainnet.helius-rpc.com');
  });

  it('reports null host when no RPC URL is configured', async () => {
    const res = await request(createApp()).get('/api/rpc/health?chain=worldchain_sepolia');

    expect(res.body.details.worldchain_sepolia.rpcHost).toBeNull();
  });
});

describe('redactRpcUrl', () => {
  it.each([
    ['https://arbitrum-mainnet.infura.io/v3/PROJECTID', 'arbitrum-mainnet.infura.io'],
    ['https://worldchain-sepolia.g.alchemy.com/v2/APIKEY', 'worldchain-sepolia.g.alchemy.com'],
    ['https://mainnet.helius-rpc.com/?api-key=APIKEY', 'mainnet.helius-rpc.com'],
    ['http://localhost:8545', 'localhost:8545'],
  ])('reduces %s to host only', (input, expected) => {
    expect(redactRpcUrl(input)).toBe(expected);
  });

  it('preserves a non-default port for diagnosis', () => {
    expect(redactRpcUrl('https://rpc.internal:8899/v2/KEY')).toBe('rpc.internal:8899');
  });

  it('returns null for null or empty input', () => {
    expect(redactRpcUrl(null)).toBeNull();
    expect(redactRpcUrl(undefined)).toBeNull();
    expect(redactRpcUrl('')).toBeNull();
  });

  it('returns UNPARSEABLE rather than falling back to the raw value', () => {
    // Falling back to the input would leak precisely when we cannot prove the
    // value is safe.
    expect(redactRpcUrl('not-a-url-with-secret-KEY123')).toBe('UNPARSEABLE');
  });

  it('strips credentials embedded in the authority', () => {
    expect(redactRpcUrl('https://user:pass@rpc.example.com/v2/KEY')).toBe('rpc.example.com');
  });
});
