import { ALLOWLISTED_TOKENS, TOKEN_PAIRS } from './tokens';
import { DEX_CONFIG, ENABLED_DEXES } from './dexes';
export interface BotConfig {
    ethereumRpcUrl: string;
    privateKey: string;
    treasuryAddress: string;
    minProfitEth: number;
    maxGasGwei: number;
    minProfitThreshold: number;
    scanIntervalMs: number;
    arbExecutorAddress: string;
    privateRelayUrl?: string | undefined;
    logLevel: string;
    maxSlippagePercent: number;
    maxGasPriceGwei: number;
    minLiquidityEth: number;
}
export declare const config: BotConfig;
export declare function validateConfig(): void;
export { ALLOWLISTED_TOKENS, TOKEN_PAIRS, DEX_CONFIG, ENABLED_DEXES };
//# sourceMappingURL=index.d.ts.map