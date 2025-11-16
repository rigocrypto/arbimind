import { ethers } from 'ethers';
import { PriceQuote, PoolInfo } from '../types';
export declare class PriceService {
    private provider;
    private logger;
    constructor(provider: ethers.Provider);
    /**
     * Get a price quote from a specific DEX
     */
    getQuote(tokenIn: string, tokenOut: string, amountIn: string, dexName: string): Promise<PriceQuote | null>;
    /**
     * Get quote from Uniswap V2 style DEX
     */
    private getV2Quote;
    /**
     * Get quote from Uniswap V3 style DEX
     */
    private getV3Quote;
    /**
     * Find token symbol by on-chain address using allowlist
     */
    private findSymbolByAddress;
    /**
     * Fetch USD price from Coingecko for known token symbols
     */
    private fetchCoingeckoPrice;
    /**
     * Get V2 pool address from factory
     */
    private getV2PoolAddress;
    /**
     * Get V2 pool reserves
     */
    private getV2Reserves;
    /**
     * Calculate V2 output amount using constant product formula
     */
    private calculateV2Output;
    /**
     * Get pool information
     */
    getPoolInfo(poolAddress: string, dexName: string): Promise<PoolInfo | null>;
}
//# sourceMappingURL=PriceService.d.ts.map