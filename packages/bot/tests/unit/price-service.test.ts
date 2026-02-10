import { describe, it, expect } from 'vitest';
import { PriceService } from '../../src/services/PriceService';

describe('PriceService', () => {
  it('returns null until DEX quote API is wired', async () => {
    const provider = {} as any;
    const service = new PriceService(provider);

    const quote = await service.getQuote('WETH', 'USDC', '1000000000000000000', 'UNISWAP_V2');
    expect(quote).toBeNull();
  });
});
