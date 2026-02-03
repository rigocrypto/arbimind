/**
 * Price service stub – fetches DEX quotes for arbitrage.
 * Wire to real DEX subgraph/RPC when ready.
 */
import type { Provider } from 'ethers';
import type { PriceQuote } from '../types';

export class PriceService {
  constructor(private _provider: Provider) {}

  async getQuote(
    _tokenIn: string,
    _tokenOut: string,
    _amountIn: string,
    _dex: string
  ): Promise<PriceQuote | null> {
    // Stub – return null until wired to DEX quote API
    void this._provider;
    return null;
  }
}
