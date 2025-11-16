import { BotStats } from '../types';
export declare class ArbitrageBot {
    private provider;
    private wallet;
    private priceService;
    private executionService;
    private logger;
    private isRunning;
    private stats;
    constructor();
    /**
     * Start the arbitrage bot
     */
    start(): Promise<void>;
    /**
     * Stop the arbitrage bot
     */
    stop(): void;
    /**
     * Get current bot statistics
     */
    getStats(): BotStats;
    /**
     * Main bot loop
     */
    private runMainLoop;
    /**
     * Scan for arbitrage opportunities across all configured pairs and DEXes
     */
    private scanForOpportunities;
    /**
     * Find arbitrage opportunities for a specific token pair
     */
    private findOpportunitiesForPair;
    /**
     * Calculate arbitrage opportunity between two quotes
     */
    private calculateArbitrageOpportunity;
    /**
     * Check if an opportunity is profitable enough to execute
     */
    private isProfitable;
    /**
     * Execute an arbitrage opportunity
     */
    private executeArbitrage;
    /**
     * Estimate gas costs for arbitrage execution
     */
    private estimateGasCost;
    /**
     * Get current gas price in wei
     */
    private getCurrentGasPrice;
    /**
     * Update bot statistics
     */
    private updateStats;
    /**
     * Validate bot setup
     */
    private validateSetup;
    /**
     * Sleep utility function
     */
    private sleep;
}
//# sourceMappingURL=ArbitrageBot.d.ts.map