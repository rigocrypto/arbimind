export interface DexConfig {
    name: string;
    router: string;
    factory: string;
    quoter?: string;
    fee: number;
    version: 'v2' | 'v3';
    feeTiers?: number[];
    enabled: boolean;
}
export declare const DEX_CONFIG: Record<string, DexConfig>;
export declare const ENABLED_DEXES: {
    name: string;
    router: string;
    factory: string;
    quoter?: string;
    fee: number;
    version: "v2" | "v3";
    feeTiers?: number[];
    enabled: boolean;
    key: string;
}[];
export declare function getDexConfig(dexName: string): DexConfig;
export declare function getEnabledDexes(): DexConfig[];
export declare function getDexRouter(dexName: string): string;
export declare function getDexFee(dexName: string): number;
//# sourceMappingURL=dexes.d.ts.map