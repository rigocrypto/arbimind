import express from 'express';
import request from 'supertest';

// Mock @solana/web3.js before importing the route
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');

  const mockGetBalance = jest.fn().mockResolvedValue(2_500_000_000); // 2.5 SOL
  const mockGetParsedTokenAccountsByOwner = jest.fn().mockResolvedValue({
    value: [
      {
        account: {
          data: {
            parsed: {
              info: {
                mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                tokenAmount: { uiAmountString: '150.50', decimals: 6 },
              },
            },
          },
        },
      },
      {
        account: {
          data: {
            parsed: {
              info: {
                mint: 'So11111111111111111111111111111111111111112',
                tokenAmount: { uiAmountString: '3.0', decimals: 9 },
              },
            },
          },
        },
      },
    ],
  });

  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: mockGetBalance,
      getParsedTokenAccountsByOwner: mockGetParsedTokenAccountsByOwner,
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'mock',
        lastValidBlockHeight: 100,
      }),
    })),
  };
});

import solanaRouter from '../routes/solana';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/solana', solanaRouter);
  return app;
}

describe('GET /api/solana/balance', () => {
  const app = buildApp();

  it('returns 400 when address is missing', async () => {
    const res = await request(app).get('/api/solana/balance');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing|invalid/i);
  });

  it('returns 400 for invalid address', async () => {
    const res = await request(app).get('/api/solana/balance?address=not-valid!!');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing|invalid/i);
  });

  it('returns SOL balance for valid address', async () => {
    const addr = '8tyY8LuYNAm14SS5LnRiFU2SzGu9F4HrNv6KhHo5FsBZ';
    const res = await request(app).get(`/api/solana/balance?address=${addr}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      address: addr,
      lamports: 2_500_000_000,
      sol: 2.5,
    });
  });

  it('respects cluster query parameter', async () => {
    const addr = '8tyY8LuYNAm14SS5LnRiFU2SzGu9F4HrNv6KhHo5FsBZ';
    const res = await request(app).get(`/api/solana/balance?address=${addr}&cluster=mainnet-beta`);
    expect(res.status).toBe(200);
    expect(res.body.sol).toBe(2.5);
  });
});

describe('GET /api/solana/token-accounts', () => {
  const app = buildApp();

  it('returns 400 when address is missing', async () => {
    const res = await request(app).get('/api/solana/token-accounts');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing|invalid/i);
  });

  it('returns 400 for invalid address', async () => {
    const res = await request(app).get('/api/solana/token-accounts?address=bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing|invalid/i);
  });

  it('returns parsed token accounts for valid address', async () => {
    const addr = '8tyY8LuYNAm14SS5LnRiFU2SzGu9F4HrNv6KhHo5FsBZ';
    const res = await request(app).get(`/api/solana/token-accounts?address=${addr}`);
    expect(res.status).toBe(200);
    expect(res.body.address).toBe(addr);
    expect(res.body.accounts).toHaveLength(2);
    expect(res.body.accounts[0]).toEqual({
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '150.50',
      decimals: 6,
    });
    expect(res.body.accounts[1]).toEqual({
      mint: 'So11111111111111111111111111111111111111112',
      amount: '3.0',
      decimals: 9,
    });
  });
});
