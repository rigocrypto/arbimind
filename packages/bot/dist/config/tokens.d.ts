export interface TokenConfig {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
}
export declare const ALLOWLISTED_TOKENS: Record<string, TokenConfig>;
export declare const TOKEN_PAIRS: {
    tokenA: string;
    tokenB: string;
}[];
export declare function getTokenAddress(symbol: string): string;
export declare function getTokenConfig(symbol: string): TokenConfig;
export declare function getAllTokenAddresses(): string[];
//# sourceMappingURL=tokens.d.ts.map