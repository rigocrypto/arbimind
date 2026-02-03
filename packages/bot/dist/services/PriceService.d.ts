/**
 * Price service stub – fetches DEX quotes for arbitrage.
 * Wire to real DEX subgraph/RPC when ready.
 */
import type { Provider } from 'ethers';
import type { PriceQuote } from '../types';
export declare class PriceService {
    private _provider;
    constructor(_provider: Provider);
    getQuote(_tokenIn: string, _tokenOut: string, _amountIn: string, _dex: string): Promise<PriceQuote | null>;
}
//# sourceMappingURL=PriceService.d.ts.map