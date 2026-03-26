import express from 'express';
import request from 'supertest';

import portfolioRoutes from '../routes/portfolio';
import { getEvmPortfolio } from '../services/portfolioService';
import { isDbAvailable, touchUser } from '../db/portfolioDb';

jest.mock('../services/portfolioService', () => ({
  getEvmPortfolio: jest.fn(),
  getEvmTimeseries: jest.fn(),
  getSolanaPortfolio: jest.fn(),
  getSolanaTimeseries: jest.fn(),
}));

jest.mock('../db/portfolioDb', () => ({
  touchUser: jest.fn(),
  getSnapshots: jest.fn(),
  isDbAvailable: jest.fn(),
}));

describe('GET /portfolio/evm', () => {
  const app = express();
  const mockedGetEvmPortfolio = getEvmPortfolio as jest.MockedFunction<typeof getEvmPortfolio>;
  const mockedTouchUser = touchUser as jest.MockedFunction<typeof touchUser>;
  const mockedIsDbAvailable = isDbAvailable as jest.MockedFunction<typeof isDbAvailable>;

  beforeAll(() => {
    app.use(express.json());
    app.use('/portfolio', portfolioRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsDbAvailable.mockReturnValue(false);
    process.env.EVM_ARB_ACCOUNT = '0x1111111111111111111111111111111111111111';
  });

  it('returns 400 for invalid EVM address', async () => {
    const res = await request(app).get('/portfolio/evm?address=bad-address');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Valid EVM address required' });
  });

  it('returns portfolio summary and touches user on success', async () => {
    const user = '0x2222222222222222222222222222222222222222';
    mockedGetEvmPortfolio.mockResolvedValue({
      chain: 'evm',
      userAddress: user,
      arbAddress: '0x1111111111111111111111111111111111111111',
      totals: { depositedUsd: 100, withdrawnUsd: 0, feesUsd: 0, pnlUsd: 10, roiPct: 10, equityUsd: 110 },
      balances: [{ symbol: 'USDC', amount: '110', usd: 110 }],
      deposits: [],
      withdrawals: [],
      updatedAt: 1,
    });

    const res = await request(app).get(`/portfolio/evm?address=${user}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ chain: 'evm', userAddress: user });
    expect(mockedGetEvmPortfolio).toHaveBeenCalledWith(user);
    expect(mockedTouchUser).toHaveBeenCalledWith('evm', user);
  });
});
