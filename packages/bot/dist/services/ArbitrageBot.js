"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbitrageBot = void 0;
const ethers_1 = require("ethers");
const config_1 = require("../config");
const config_2 = require("../config");
const PriceService_1 = require("./PriceService");
const ExecutionService_1 = require("./ExecutionService");
const Logger_1 = require("../utils/Logger");
// AI orchestrator imports removed (not used in current flow)
class ArbitrageBot {
    provider;
    wallet;
    priceService;
    executionService;
    // AI orchestrator currently unused in main loop; keep for future use
    // private aiOrchestrator: AIOrchestrator | undefined;
    logger;
    isRunning = false;
    stats;
    // last scan timestamp removed (not currently read anywhere)
    constructor() {
        this.provider = new ethers_1.ethers.JsonRpcProvider(config_1.config.ethereumRpcUrl);
        this.wallet = new ethers_1.ethers.Wallet(config_1.config.privateKey, this.provider);
        this.priceService = new PriceService_1.PriceService(this.provider);
        this.executionService = new ExecutionService_1.ExecutionService(this.wallet, config_1.config.arbExecutorAddress);
        // AI orchestrator initialization deferred until used
        // this.aiOrchestrator = new AIOrchestrator();
        this.logger = new Logger_1.Logger('ArbitrageBot');
        this.stats = {
            totalOpportunities: 0,
            successfulTrades: 0,
            failedTrades: 0,
            totalProfit: '0',
            totalGasUsed: '0',
            averageProfit: '0',
            successRate: 0,
            startTime: Date.now(),
            lastTradeTime: 0
        };
    }
    /**
     * Start the arbitrage bot
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('Bot is already running');
            return;
        }
        this.logger.info('Starting ArbiMind arbitrage bot...');
        this.isRunning = true;
        this.stats.startTime = Date.now();
        // Validate configuration
        this.validateSetup();
        // Start the main loop
        await this.runMainLoop();
    }
    /**
     * Stop the arbitrage bot
     */
    stop() {
        this.logger.info('Stopping ArbiMind arbitrage bot...');
        this.isRunning = false;
    }
    /**
     * Get current bot statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Main bot loop
     */
    async runMainLoop() {
        while (this.isRunning) {
            try {
                await this.scanForOpportunities();
                await this.sleep(config_1.config.scanIntervalMs);
            }
            catch (error) {
                this.logger.error('Error in main loop', { error: error instanceof Error ? error.message : error });
                await this.sleep(1000); // Wait longer on error
            }
        }
    }
    /**
     * Scan for arbitrage opportunities across all configured pairs and DEXes
     */
    async scanForOpportunities() {
        const startTime = Date.now();
        this.logger.debug('Scanning for arbitrage opportunities...');
        for (const pair of config_1.TOKEN_PAIRS) {
            try {
                const opportunities = await this.findOpportunitiesForPair(pair.tokenA, pair.tokenB);
                for (const opportunity of opportunities) {
                    if (this.isProfitable(opportunity)) {
                        await this.executeArbitrage(opportunity);
                    }
                }
            }
            catch (error) {
                this.logger.error(`Error scanning pair ${pair.tokenA}-${pair.tokenB}`, {
                    error: error instanceof Error ? error.message : error
                });
            }
        }
        const scanDuration = Date.now() - startTime;
        this.logger.debug(`Scan completed in ${scanDuration}ms`);
    }
    /**
     * Find arbitrage opportunities for a specific token pair
     */
    async findOpportunitiesForPair(tokenA, tokenB) {
        const opportunities = [];
        const enabledDexes = Object.entries(config_2.DEX_CONFIG).filter(([_, cfg]) => cfg.enabled);
        // Get quotes from all DEXes
        const quotes = [];
        const amountIn = ethers_1.ethers.parseEther('1'); // 1 ETH base amount
        for (const [dexName] of enabledDexes) {
            try {
                const quote = await this.priceService.getQuote(tokenA, tokenB, amountIn.toString(), dexName);
                if (quote) {
                    quotes.push(quote);
                }
            }
            catch (error) {
                this.logger.debug(`Failed to get quote from ${dexName}`, {
                    error: error instanceof Error ? error.message : error
                });
            }
        }
        // Find arbitrage opportunities between different DEXes
        for (let i = 0; i < quotes.length; i++) {
            for (let j = i + 1; j < quotes.length; j++) {
                const quote1 = quotes[i];
                const quote2 = quotes[j];
                if (!quote1 || !quote2)
                    continue;
                const opportunity = this.calculateArbitrageOpportunity(quote1, quote2, amountIn.toString());
                if (opportunity) {
                    opportunities.push(opportunity);
                }
            }
        }
        return opportunities.sort((a, b) => parseFloat(b.profit) - parseFloat(a.profit));
    }
    /**
     * Calculate arbitrage opportunity between two quotes
     */
    calculateArbitrageOpportunity(quote1, quote2, amountIn) {
        const amountInBig = ethers_1.ethers.getBigInt(amountIn);
        const amountOut1Big = ethers_1.ethers.getBigInt(quote1.amountOut);
        const amountOut2Big = ethers_1.ethers.getBigInt(quote2.amountOut);
        // Calculate profit (assuming we buy on DEX1 and sell on DEX2)
        const profit = amountOut2Big > amountOut1Big ? amountOut2Big - amountOut1Big : ethers_1.ethers.getBigInt(0);
        if (profit <= 0) {
            return null;
        }
        // Estimate gas costs
        const gasEstimate = this.estimateGasCost();
        const netProfit = profit - ethers_1.ethers.getBigInt(gasEstimate.totalCost);
        if (netProfit <= 0) {
            return null;
        }
        const profitPercent = (Number(profit) / Number(amountInBig)) * 100;
        return {
            tokenA: quote1.tokenIn,
            tokenB: quote1.tokenOut,
            dex1: quote1.dex,
            dex2: quote2.dex,
            amountIn,
            amountOut1: quote1.amountOut,
            amountOut2: quote2.amountOut,
            profit: profit.toString(),
            profitPercent,
            gasEstimate: gasEstimate.totalCost,
            netProfit: netProfit.toString(),
            route: `${quote1.dex} -> ${quote2.dex}`,
            timestamp: Date.now()
        };
    }
    /**
     * Check if an opportunity is profitable enough to execute
     */
    isProfitable(opportunity) {
        const netProfitEth = ethers_1.ethers.formatEther(opportunity.netProfit);
        const minProfitEth = config_1.config.minProfitEth;
        if (parseFloat(netProfitEth) < minProfitEth) {
            return false;
        }
        // Check gas price
        const currentGasPrice = this.getCurrentGasPrice();
        if (currentGasPrice > config_1.config.maxGasGwei) {
            this.logger.debug('Gas price too high, skipping opportunity');
            return false;
        }
        return true;
    }
    /**
     * Execute an arbitrage opportunity
     */
    async executeArbitrage(opportunity) {
        this.logger.info('Executing arbitrage opportunity', {
            tokenA: opportunity.tokenA,
            tokenB: opportunity.tokenB,
            dex1: opportunity.dex1,
            dex2: opportunity.dex2,
            profit: ethers_1.ethers.formatEther(opportunity.profit),
            netProfit: ethers_1.ethers.formatEther(opportunity.netProfit)
        });
        try {
            const result = await this.executionService.executeArbitrage(opportunity);
            if (result.success) {
                this.stats.successfulTrades++;
                this.stats.totalProfit = (BigInt(this.stats.totalProfit) + BigInt(result.profit)).toString();
                this.stats.totalGasUsed = (BigInt(this.stats.totalGasUsed) + BigInt(result.gasUsed)).toString();
                this.stats.lastTradeTime = Date.now();
                this.logger.info('Arbitrage executed successfully', {
                    hash: result.hash,
                    profit: ethers_1.ethers.formatEther(result.profit),
                    gasUsed: result.gasUsed
                });
            }
            else {
                this.stats.failedTrades++;
                this.logger.error('Arbitrage execution failed', {
                    error: result.error,
                    gasUsed: result.gasUsed
                });
            }
            this.updateStats();
        }
        catch (error) {
            this.stats.failedTrades++;
            this.logger.error('Error executing arbitrage', {
                error: error instanceof Error ? error.message : error
            });
            this.updateStats();
        }
    }
    /**
     * Estimate gas costs for arbitrage execution
     */
    estimateGasCost() {
        const gasLimit = 300000; // Conservative estimate
        const gasPrice = this.getCurrentGasPrice();
        const totalCost = gasLimit * gasPrice;
        return {
            totalCost: totalCost.toString()
        };
    }
    /**
     * Get current gas price in wei
     */
    getCurrentGasPrice() {
        // This would typically come from a gas price oracle
        // For now, return a conservative estimate
        return 20 * 1e9; // 20 gwei in wei
    }
    /**
     * Update bot statistics
     */
    updateStats() {
        const totalTrades = this.stats.successfulTrades + this.stats.failedTrades;
        this.stats.successRate = totalTrades > 0 ? (this.stats.successfulTrades / totalTrades) * 100 : 0;
        if (this.stats.successfulTrades > 0) {
            this.stats.averageProfit = (BigInt(this.stats.totalProfit) / BigInt(this.stats.successfulTrades)).toString();
        }
    }
    /**
     * Validate bot setup
     */
    validateSetup() {
        if (!this.wallet.address) {
            throw new Error('Invalid wallet configuration');
        }
        if (!config_1.config.arbExecutorAddress) {
            throw new Error('ArbExecutor address not configured');
        }
        this.logger.info('Bot setup validated', {
            walletAddress: this.wallet.address,
            executorAddress: config_1.config.arbExecutorAddress,
            treasuryAddress: config_1.config.treasuryAddress
        });
    }
    /**
     * Sleep utility function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ArbitrageBot = ArbitrageBot;
//# sourceMappingURL=ArbitrageBot.js.map