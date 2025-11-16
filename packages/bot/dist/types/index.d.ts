export interface ArbitrageOpportunity {
    tokenA: string;
    tokenB: string;
    dex1: string;
    dex2: string;
    amountIn: string;
    amountOut1: string;
    amountOut2: string;
    profit: string;
    profitPercent: number;
    gasEstimate: string;
    netProfit: string;
    route: string;
    timestamp: number;
}
export interface PriceQuote {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    dex: string;
    fee: number;
    timestamp: number;
}
export interface PoolInfo {
    address: string;
    token0: string;
    token1: string;
    reserve0: string;
    reserve1: string;
    fee: number;
    dex: string;
    liquidity: string;
}
export interface TransactionResult {
    hash: string;
    success: boolean;
    gasUsed: string;
    gasPrice: string;
    profit: string;
    error?: string;
    timestamp: number;
}
export interface BotStats {
    totalOpportunities: number;
    successfulTrades: number;
    failedTrades: number;
    totalProfit: string;
    totalGasUsed: string;
    averageProfit: string;
    successRate: number;
    startTime: number;
    lastTradeTime: number;
}
export interface GasEstimate {
    gasLimit: string;
    gasPrice: string;
    totalCost: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
}
export interface SimulationResult {
    success: boolean;
    gasUsed: string;
    amountOut: string;
    error?: string;
}
export interface RouteConfig {
    tokenA: string;
    tokenB: string;
    dex1: string;
    dex2: string;
    amountIn: string;
    minOut1: string;
    minOut2: string;
    deadline: number;
}
export interface ExecutionParams {
    route: RouteConfig;
    gasEstimate: GasEstimate;
    minProfit: string;
}
export declare enum LogLevel {
    ERROR = "error",
    WARN = "warn",
    INFO = "info",
    DEBUG = "debug"
}
export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    data?: any;
}
export interface MarketData {
    token: string;
    price: string;
    volume24h: string;
    change24h: number;
    liquidity: string;
    timestamp: number;
}
//# sourceMappingURL=index.d.ts.map