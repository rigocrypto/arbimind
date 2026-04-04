import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mock rate limiter BEFORE importing the route (it's applied at module load)
// ---------------------------------------------------------------------------
jest.mock('express-rate-limit', () => {
  return () => (_req: unknown, _res: unknown, next: () => void) => next();
});

// ---------------------------------------------------------------------------
// Set env BEFORE importing the route (module reads at import time)
// ---------------------------------------------------------------------------
const ORIGINAL_ENV = process.env.EVM_SWAP_API_KEY;
process.env.EVM_SWAP_API_KEY = 'test-api-key';

import evmSwapRouter from '../routes/evmSwap';

// ---------------------------------------------------------------------------
// Mock global fetch so no real 0x calls are made
// ---------------------------------------------------------------------------
const mockFetch = jest.fn() as jest.Mock;
(global as unknown as Record<string, unknown>).fetch = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  // Disable rate limiting in tests by mounting without the limiter wrapper.
  // The router already has the limiter built-in, so we increase the limit.
  app.set('trust proxy', true);
  app.use('/api/evm/swap', evmSwapRouter);
  return app;
}

const VALID_BODY = {
  chainId: 1,
  sellToken: 'ETH',
  buyToken: 'USDC',
  sellAmount: '1000000000000000000',
  takerAddress: '0x1234567890abcdef1234567890abcdef12345678',
  slippageBps: 50,
};

function mock0xSuccess(data: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  });
}

function mock0xError(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  });
}

afterEach(() => {
  mockFetch.mockReset();
});

afterAll(() => {
  if (ORIGINAL_ENV !== undefined) {
    process.env.EVM_SWAP_API_KEY = ORIGINAL_ENV;
  } else {
    delete process.env.EVM_SWAP_API_KEY;
  }
});

// ===================================================================
// Validation tests — POST /api/evm/swap/quote
// ===================================================================

describe('POST /api/evm/swap/quote — validation', () => {
  const app = buildApp();

  it('returns 400 for missing params (empty body)', async () => {
    const res = await request(app).post('/api/evm/swap/quote').send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for unsupported chainId', async () => {
    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, chainId: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/chainId/i);
  });

  it('returns 400 for same sell/buy token', async () => {
    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, sellToken: 'ETH', buyToken: 'ETH' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/different/i);
  });

  it('returns 400 for invalid takerAddress', async () => {
    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, takerAddress: 'not-an-address' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/takerAddress/i);
  });

  it('returns 400 for missing sellAmount', async () => {
    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, sellAmount: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sellAmount/i);
  });

  it('returns 400 for zero sellAmount', async () => {
    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, sellAmount: '0' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sellAmount/i);
  });

  it('returns 400 for slippageBps out of range', async () => {
    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, slippageBps: 10000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slippageBps/i);
  });

  it('returns 400 for missing sell/buy tokens', async () => {
    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ chainId: 1, sellAmount: '1000', takerAddress: VALID_BODY.takerAddress });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sellToken|buyToken/i);
  });
});

// ===================================================================
// Validation tests — POST /api/evm/swap/tx
// ===================================================================

describe('POST /api/evm/swap/tx — validation', () => {
  const app = buildApp();

  it('returns 400 for missing params (empty body)', async () => {
    const res = await request(app).post('/api/evm/swap/tx').send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 for unsupported chainId', async () => {
    const res = await request(app)
      .post('/api/evm/swap/tx')
      .send({ ...VALID_BODY, chainId: 56 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/chainId/i);
  });

  it('returns 400 for invalid takerAddress', async () => {
    const res = await request(app)
      .post('/api/evm/swap/tx')
      .send({ ...VALID_BODY, takerAddress: '0xshort' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/takerAddress/i);
  });
});

// ===================================================================
// Token resolution
// ===================================================================

describe('Token resolution', () => {
  const app = buildApp();

  it('resolves ETH to native token address', async () => {
    mock0xSuccess({
      buyAmount: '3000000000',
      sellAmount: '1000000000000000000',
      price: '3000',
      gas: '200000',
    });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    // Verify the 0x fetch was called with native token address
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('sellToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
  });

  it('resolves USDC to chain-specific address (chain 1)', async () => {
    mock0xSuccess({
      buyAmount: '1000000000000000000',
      sellAmount: '3000000000',
      price: '0.000333',
    });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, sellToken: 'USDC', buyToken: 'ETH', sellAmount: '3000000000' });

    expect(res.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('sellToken=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  });

  it('resolves USDC to chain-specific address (Arbitrum 42161)', async () => {
    mock0xSuccess({
      buyAmount: '1000000000000000000',
      sellAmount: '3000000000',
      price: '0.000333',
    });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, chainId: 42161, sellToken: 'USDC', buyToken: 'ETH', sellAmount: '3000000000' });

    expect(res.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('sellToken=0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
  });

  it('passes raw 0x-prefixed address through', async () => {
    const rawAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT
    mock0xSuccess({
      buyAmount: '3000000000',
      sellAmount: '1000000000',
      price: '3',
    });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send({ ...VALID_BODY, sellToken: rawAddr, buyToken: 'ETH', sellAmount: '1000000000' });

    expect(res.status).toBe(200);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(`sellToken=${rawAddr}`);
  });
});

// ===================================================================
// Mocked 0x success — quote shape
// ===================================================================

describe('POST /api/evm/swap/quote — success', () => {
  const app = buildApp();

  it('returns expected quote shape from 0x response', async () => {
    mock0xSuccess({
      buyAmount: '3000000000',
      sellAmount: '1000000000000000000',
      price: '3000.00',
      gas: '150000',
      route: { fills: [{ source: 'Uniswap_V3', proportion: '1' }] },
      issues: { allowance: { spender: '0xAllowanceHolder' } },
    });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      buyAmount: '3000000000',
      sellAmount: '1000000000000000000',
      price: '3000.00',
      estimatedGas: '150000',
      allowanceTarget: '0xAllowanceHolder',
    });
    expect(res.body.sources).toEqual([{ source: 'Uniswap_V3', proportion: '1' }]);
  });

  it('handles missing gas and allowance fields gracefully', async () => {
    mock0xSuccess({
      buyAmount: '100',
      sellAmount: '200',
      price: '0.5',
    });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.estimatedGas).toBeNull();
    expect(res.body.allowanceTarget).toBeNull();
    expect(res.body.sources).toEqual([]);
  });
});

// ===================================================================
// Mocked 0x success — tx shape
// ===================================================================

describe('POST /api/evm/swap/tx — success', () => {
  const app = buildApp();

  it('returns expected tx shape from 0x response', async () => {
    mock0xSuccess({
      buyAmount: '3000000000',
      sellAmount: '1000000000000000000',
      transaction: {
        to: '0xRouterAddress',
        data: '0xcalldata123',
        value: '1000000000000000000',
        gas: '200000',
      },
      issues: { allowance: { spender: '0xSpenderAddr' } },
    });

    const res = await request(app)
      .post('/api/evm/swap/tx')
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      to: '0xRouterAddress',
      data: '0xcalldata123',
      value: '1000000000000000000',
      gas: '200000',
      buyAmount: '3000000000',
      sellAmount: '1000000000000000000',
      allowanceTarget: '0xSpenderAddr',
    });
  });

  it('returns 502 when 0x response missing transaction data', async () => {
    mock0xSuccess({
      buyAmount: '100',
      sellAmount: '200',
      // no transaction field
    });

    const res = await request(app)
      .post('/api/evm/swap/tx')
      .send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/incomplete/i);
  });
});

// ===================================================================
// Mocked 0x upstream failures
// ===================================================================

describe('0x upstream error handling', () => {
  const app = buildApp();

  it('returns sanitized error on 0x 400 (liquidity)', async () => {
    mock0xError(400, { reason: 'INSUFFICIENT_ASSET_LIQUIDITY' });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/liquidity/i);
  });

  it('returns sanitized error on 0x rate limit (429)', async () => {
    mock0xError(429, { reason: 'Rate limited' });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send(VALID_BODY);

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/rate limit/i);
  });

  it('returns 502 on 0x 500 server error', async () => {
    mock0xError(500, { reason: 'Internal error' });

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/aggregator/i);
  });

  it('returns 502 on network/fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await request(app)
      .post('/api/evm/swap/quote')
      .send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/unable to reach/i);
  });
});

// ===================================================================
// Route mount verification
// ===================================================================

describe('Route mount', () => {
  const app = buildApp();

  it('/quote is only POST', async () => {
    const res = await request(app).get('/api/evm/swap/quote');
    expect([404, 405]).toContain(res.status);
  });

  it('/tx is only POST', async () => {
    const res = await request(app).get('/api/evm/swap/tx');
    expect([404, 405]).toContain(res.status);
  });

  it('unknown sub-route returns 404', async () => {
    const res = await request(app).post('/api/evm/swap/unknown').send(VALID_BODY);
    expect(res.status).toBe(404);
  });
});
