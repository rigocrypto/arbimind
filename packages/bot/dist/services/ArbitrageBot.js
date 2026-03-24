"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbitrageBot = void 0;
const ethers_1 = require("ethers");
const config_1 = require("../config");
const config_2 = require("../config");
const tokens_1 = require("../config/tokens");
const PriceService_1 = require("./PriceService");
const ExecutionService_1 = require("./ExecutionService");
const Logger_1 = require("../utils/Logger");
const AiScoringService_1 = require("./AiScoringService");
class ArbitrageBot {
    provider;
    wallet;
    walletAddress;
    priceService;
    executionService;
    aiScoringService;
    botConfig;
    tokenPairs;
    // AI orchestrator currently unused in main loop; keep for future use
    // private aiOrchestrator: AIOrchestrator | undefined;
    logger;
    isRunning = false;
    stats;
    canaryDailyPnlEth = 0;
    canaryDay = new Date().toISOString().slice(0, 10);
    lastSanityTxAtMs = 0;
    // last scan timestamp removed (not currently read anywhere)
    constructor(deps = {}) {
        this.logger = deps.logger ?? new Logger_1.Logger('ArbitrageBot');
        this.botConfig = { ...config_1.config, ...deps.config };
        this.provider = deps.provider ?? new ethers_1.ethers.JsonRpcProvider(this.botConfig.ethereumRpcUrl);
        this.walletAddress = this.botConfig.walletAddress ?? '';
        if (deps.wallet) {
            this.wallet = deps.wallet;
            this.walletAddress = deps.wallet.address;
            this.logger.info(`✅ Wallet loaded: ${this.walletAddress}`);
        }
        // Only create wallet if privateKey is valid
        if (!this.wallet &&
            this.botConfig.privateKey &&
            this.botConfig.privateKey.length === 66 &&
            this.botConfig.privateKey.startsWith('0x')) {
            this.wallet = new ethers_1.ethers.Wallet(this.botConfig.privateKey, this.provider);
            this.walletAddress = this.wallet.address;
            this.logger.info(`✅ Wallet loaded: ${this.walletAddress}`);
        }
        if (!this.wallet) {
            if (this.walletAddress) {
                this.logger.warn(`⚠️ LOG_ONLY: No valid PRIVATE_KEY, using WALLET_ADDRESS fallback: ${this.walletAddress}`);
            }
            else {
                this.logger.warn('⚠️ LOG_ONLY: No valid PRIVATE_KEY and no WALLET_ADDRESS fallback, running without wallet identity.');
            }
        }
        this.priceService = deps.priceService ?? new PriceService_1.PriceService(this.provider);
        if (deps.executionService) {
            this.executionService = deps.executionService;
        }
        else if (this.wallet) {
            this.executionService = new ExecutionService_1.ExecutionService(this.wallet, this.botConfig.arbExecutorAddress);
        }
        else {
            this.executionService = undefined;
        }
        const aiConfig = this.botConfig.aiPredictUrl
            ? {
                predictUrl: this.botConfig.aiPredictUrl,
                ...(this.botConfig.aiLogUrl ? { logUrl: this.botConfig.aiLogUrl } : {}),
                ...(this.botConfig.aiServiceKey ? { serviceKey: this.botConfig.aiServiceKey } : {}),
                ...(this.botConfig.aiModelTag ? { modelTag: this.botConfig.aiModelTag } : {}),
                ...(this.botConfig.aiPredictionHorizonSec ? { horizonSec: this.botConfig.aiPredictionHorizonSec } : {})
            }
            : undefined;
        this.aiScoringService = deps.aiScoringService ?? (aiConfig ? new AiScoringService_1.AiScoringService(aiConfig) : undefined);
        // AI orchestrator initialization deferred until used
        // this.aiOrchestrator = new AIOrchestrator();
        this.tokenPairs = deps.tokenPairs ?? (0, tokens_1.getEffectiveTokenPairs)();
        console.log('[SCANNER_INIT]', {
            pairsLoaded: this.tokenPairs.length,
            pairs: this.tokenPairs.map((p) => `${p.tokenA}/${p.tokenB}`),
        });
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
        if (this.botConfig.canaryEnabled) {
            this.logger.warn('🧪 CANARY mode enabled', {
                notionalEth: this.botConfig.canaryNotionalEth,
                maxDailyLossEth: this.botConfig.canaryMaxDailyLossEth
            });
        }
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
        // One-time token approvals for Sepolia routers (before scan loop)
        const isSepolia = this.botConfig.network === 'testnet' && this.botConfig.evmChain === 'ethereum';
        if (isSepolia && this.executionService && !this.botConfig.logOnly) {
            try {
                await this.executionService.ensureSepoliaRouterApprovals();
            }
            catch (e) {
                this.logger.warn('Sepolia router approvals failed (non-fatal)', {
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
        else if (isSepolia && this.botConfig.logOnly) {
            this.logger.info('LOG_ONLY enabled: skipping router approval transactions');
        }
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
                await this.maybeRunSanityTransfer();
                await this.scanForOpportunities();
                await this.sleep(this.botConfig.scanIntervalMs);
            }
            catch (error) {
                this.logger.error('Error in main loop', { error: error instanceof Error ? error.message : error });
                await this.sleep(1000); // Wait longer on error
            }
        }
    }
    async maybeRunSanityTransfer() {
        if (!this.botConfig.sanityTxEnabled) {
            return;
        }
        if (!this.executionService) {
            console.error('[SANITY_SKIP] execution service unavailable');
            return;
        }
        const intervalMs = this.botConfig.sanityTxIntervalSec * 1000;
        const now = Date.now();
        if (now - this.lastSanityTxAtMs < intervalMs) {
            return;
        }
        const to = this.botConfig.sanityTxTo || this.walletAddress;
        if (!to) {
            console.error('[SANITY_SKIP] no recipient address (set SANITY_TX_TO or wallet identity)');
            this.lastSanityTxAtMs = now;
            return;
        }
        this.lastSanityTxAtMs = now;
        if (this.walletAddress) {
            try {
                const balanceWei = await this.provider.getBalance(this.walletAddress);
                console.log(`[SANITY_BALANCE] wallet=${this.walletAddress} balanceWei=${balanceWei.toString()} balanceEth=${ethers_1.ethers.formatEther(balanceWei)}`);
            }
            catch (error) {
                console.error(`[SANITY_BALANCE_FAIL] error=${error instanceof Error ? error.message : String(error)}`);
            }
        }
        console.log(`[SANITY_ATTEMPT] ts=${new Date().toISOString()} to=${to} valueWei=${this.botConfig.sanityTxWei}`);
        const result = await this.executionService.executeSanityTransfer(to, this.botConfig.sanityTxWei);
        if (result.success) {
            console.log(`[SANITY_OK] hash=${result.hash} gasUsed=${result.gasUsed} gasPrice=${result.gasPrice}`);
        }
        else {
            console.error(`[SANITY_FAIL] error=${result.error || 'unknown'}`);
        }
    }
    /**
     * Run a single scan + execute cycle (useful for tests)
     */
    async runCycle() {
        return this.scanForOpportunities();
    }
    /**
     * Scan for arbitrage opportunities across all configured pairs and DEXes
     */
    async scanForOpportunities() {
        const startTime = Date.now();
        let opportunitiesFound = 0;
        let executed = 0;
        let scoredOpps = 0;
        let quotesOk = 0;
        let quotesFailed = 0;
        this.logger.debug('Scanning for arbitrage opportunities...');
        console.log('[SCAN_START]', { pairsCount: this.tokenPairs.length });
        for (const pair of this.tokenPairs) {
            try {
                const { opportunities, quotesOk: ok, quotesFailed: fail } = await this.findOpportunitiesForPair(pair.tokenA, pair.tokenB);
                quotesOk += ok;
                quotesFailed += fail;
                opportunitiesFound += opportunities.length;
                for (const opportunity of opportunities) {
                    const { approved, scored } = await this.isAiApproved(opportunity);
                    if (scored)
                        scoredOpps++;
                    if (this.isProfitable(opportunity) && approved) {
                        const success = await this.executeArbitrage(opportunity);
                        if (success)
                            executed++;
                    }
                }
            }
            catch (error) {
                this.logger.error(`Error scanning pair ${pair.tokenA}-${pair.tokenB}`, {
                    error: error instanceof Error ? error.message : error,
                });
            }
        }
        const scanDuration = Date.now() - startTime;
        this.logger.debug(`Scan completed in ${scanDuration}ms`);
        console.log('[SCAN_TICK]', {
            ts: new Date().toISOString(),
            pairsChecked: this.tokenPairs.length,
            quotesOk,
            quotesFailed,
            opportunitiesFound,
            durationMs: scanDuration,
        });
        return { opportunitiesFound, executed, scoredOpps };
    }
    /**
     * Find arbitrage opportunities for a specific token pair
     */
    async findOpportunitiesForPair(tokenA, tokenB) {
        const opportunities = [];
        const enabledDexes = Object.entries(config_2.DEX_CONFIG).filter(([_, cfg]) => cfg.enabled);
        let quotesOk = 0;
        let quotesFailed = 0;
        const quotes = [];
        const amountIn = ethers_1.ethers.parseEther(String(this.botConfig.swapAmountEth ?? 0.001));
        const decimalsIn = (0, tokens_1.getTokenConfig)(tokenA).decimals;
        const decimalsOut = (0, tokens_1.getTokenConfig)(tokenB).decimals;
        for (const [dexName] of enabledDexes) {
            try {
                const quote = await this.priceService.getQuote(tokenA, tokenB, amountIn.toString(), dexName);
                if (quote) {
                    quotes.push(quote);
                    quotesOk++;
                    this.logger.debug('[QUOTE]', {
                        pair: `${tokenA}/${tokenB}`,
                        dex: quote.dex,
                        fee: quote.fee,
                        amountIn: amountIn.toString(),
                        amountOut: quote.amountOut,
                        price: Number(quote.amountOut) / Number(amountIn),
                    });
                }
                else {
                    quotesFailed++;
                }
            }
            catch (error) {
                quotesFailed++;
                this.logger.debug(`Failed to get quote from ${dexName}`, {
                    error: error instanceof Error ? error.message : error,
                });
            }
        }
        const v3Quote = quotes.find((q) => q.dex === 'UNISWAP_V3');
        const v2Quote = quotes.find((q) => q.dex === 'UNISWAP_V2');
        const amountInNum = Number(amountIn.toString());
        console.log('[QUOTE_RESULT]', {
            pair: `${tokenA}/${tokenB}`,
            v3: v3Quote
                ? (Number(v3Quote.amountOut) / 10 ** decimalsOut) / (amountInNum / 10 ** decimalsIn)
                : 'null',
            v2: v2Quote
                ? (Number(v2Quote.amountOut) / 10 ** decimalsOut) / (amountInNum / 10 ** decimalsIn)
                : 'null',
        });
        // Find arbitrage opportunities between different DEXes (with spread threshold)
        const minEdgeBps = this.botConfig.minEdgeBps ?? 10;
        for (let i = 0; i < quotes.length; i++) {
            for (let j = i + 1; j < quotes.length; j++) {
                const quote1 = quotes[i];
                const quote2 = quotes[j];
                if (!quote1 || !quote2)
                    continue;
                const amountInNum = Number(amountIn.toString());
                const price1 = (Number(quote1.amountOut) / 10 ** decimalsOut) / (amountInNum / 10 ** decimalsIn);
                const price2 = (Number(quote2.amountOut) / 10 ** decimalsOut) / (amountInNum / 10 ** decimalsIn);
                const spread = Math.abs(price1 - price2) / Math.min(price1, price2);
                const spreadBps = spread * 10000;
                const v3Quote = quote1.dex === 'UNISWAP_V3' ? quote1 : quote2;
                const v2Quote = quote1.dex === 'UNISWAP_V2' ? quote1 : quote2;
                const v3Price = v3Quote === quote1 ? price1 : price2;
                const v2Price = v2Quote === quote1 ? price1 : price2;
                console.log('[SPREAD]', {
                    pair: `${tokenA}/${tokenB}`,
                    v3Price,
                    v2Price,
                    spreadBps: spreadBps.toFixed(2),
                    threshold: minEdgeBps,
                });
                if (spreadBps < minEdgeBps)
                    continue;
                const opportunity = this.calculateArbitrageOpportunity(quote1, quote2, amountIn.toString());
                if (opportunity) {
                    opportunities.push(opportunity);
                }
            }
        }
        return {
            opportunities: opportunities.sort((a, b) => parseFloat(b.profit) - parseFloat(a.profit)),
            quotesOk,
            quotesFailed,
        };
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
        const minProfitEth = this.botConfig.minProfitEth;
        if (parseFloat(netProfitEth) < minProfitEth) {
            return false;
        }
        // Check gas price
        const currentGasPrice = this.getCurrentGasPrice();
        const currentGasGwei = currentGasPrice / 1e9;
        if (currentGasGwei > this.botConfig.maxGasGwei) {
            this.logger.debug('Gas price too high, skipping opportunity');
            return false;
        }
        return true;
    }
    async isAiApproved(opportunity) {
        if (!this.aiScoringService)
            return { approved: true, scored: false };
        try {
            const prediction = await this.aiScoringService.scoreOpportunity(opportunity, {
                chain: 'evm',
                pairAddress: `${opportunity.tokenA}-${opportunity.tokenB}`
            });
            if (!prediction)
                return { approved: true, scored: true };
            const approved = prediction.successProb >= this.botConfig.aiMinSuccessProb &&
                prediction.expectedProfitPct >= this.botConfig.aiMinExpectedProfitPct;
            if (!approved) {
                this.logger.debug('AI rejected opportunity', {
                    successProb: prediction.successProb,
                    expectedProfitPct: prediction.expectedProfitPct
                });
            }
            return { approved, scored: true };
        }
        catch (error) {
            this.logger.debug('AI scoring failed, defaulting to execute', {
                error: error instanceof Error ? error.message : error
            });
            return { approved: true, scored: true };
        }
    }
    /**
     * Execute an arbitrage opportunity
     */
    async executeArbitrage(opportunity) {
        if (this.botConfig.canaryEnabled) {
            this.resetCanaryDayIfNeeded();
            if (this.canaryDailyPnlEth <= -this.botConfig.canaryMaxDailyLossEth) {
                this.logger.error('🛑 Canary daily loss cap reached. Halting bot.', {
                    dailyPnlEth: this.canaryDailyPnlEth,
                    maxDailyLossEth: this.botConfig.canaryMaxDailyLossEth
                });
                this.stop();
                return false;
            }
            const amountInEth = parseFloat(ethers_1.ethers.formatEther(opportunity.amountIn));
            if (amountInEth > this.botConfig.canaryNotionalEth) {
                this.logger.info('🧪 Canary skip: opportunity exceeds max notional', {
                    amountInEth,
                    canaryNotionalEth: this.botConfig.canaryNotionalEth,
                    route: opportunity.route
                });
                return false;
            }
        }
        if (this.botConfig.logOnly) {
            console.log(`[EXECUTE_SKIP_LOG_ONLY] route=${opportunity.route} tokenA=${opportunity.tokenA} tokenB=${opportunity.tokenB} netProfitEth=${ethers_1.ethers.formatEther(opportunity.netProfit)}`);
            this.logger.info('Testnet mode: skipping real execution', {
                tokenA: opportunity.tokenA,
                tokenB: opportunity.tokenB,
                dex1: opportunity.dex1,
                dex2: opportunity.dex2,
                profit: ethers_1.ethers.formatEther(opportunity.profit),
                netProfit: ethers_1.ethers.formatEther(opportunity.netProfit)
            });
            return true;
        }
        this.logger.info('Executing arbitrage opportunity', {
            tokenA: opportunity.tokenA,
            tokenB: opportunity.tokenB,
            dex1: opportunity.dex1,
            dex2: opportunity.dex2,
            profit: ethers_1.ethers.formatEther(opportunity.profit),
            netProfit: ethers_1.ethers.formatEther(opportunity.netProfit)
        });
        if (!this.executionService) {
            console.error(`[EXECUTE_ERROR] execution service unavailable route=${opportunity.route}`);
            this.logger.error('Execution service unavailable: wallet not initialized for live execution mode');
            return false;
        }
        try {
            console.log(`[EXECUTE_ATTEMPT] ts=${new Date().toISOString()} route=${opportunity.route} tokenA=${opportunity.tokenA} tokenB=${opportunity.tokenB} netProfitEth=${ethers_1.ethers.formatEther(opportunity.netProfit)}`);
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
                console.log(`[EXECUTE_OK] hash=${result.hash} gasUsed=${result.gasUsed} profitEth=${ethers_1.ethers.formatEther(result.profit)}`);
                this.updateCanaryPnl(result);
                this.updateStats();
                return true;
            }
            else {
                this.stats.failedTrades++;
                this.logger.error('Arbitrage execution failed', {
                    error: result.error,
                    gasUsed: result.gasUsed
                });
                console.error(`[EXECUTE_FAIL] error=${result.error || 'unknown'} gasUsed=${result.gasUsed}`);
                this.updateCanaryPnl(result);
                this.updateStats();
                return false;
            }
        }
        catch (error) {
            this.stats.failedTrades++;
            this.logger.error('Error executing arbitrage', {
                error: error instanceof Error ? error.message : error
            });
            console.error(`[EXECUTE_THROW] error=${error instanceof Error ? error.message : String(error)}`);
            this.updateStats();
            return false;
        }
    }
    resetCanaryDayIfNeeded() {
        const currentDay = new Date().toISOString().slice(0, 10);
        if (currentDay !== this.canaryDay) {
            this.canaryDay = currentDay;
            this.canaryDailyPnlEth = 0;
            this.logger.info('🧪 Canary day rollover: reset daily PnL tracker');
        }
    }
    updateCanaryPnl(result) {
        if (!this.botConfig.canaryEnabled) {
            return;
        }
        this.resetCanaryDayIfNeeded();
        const profitWei = BigInt(result.profit || '0');
        const gasUsed = BigInt(result.gasUsed || '0');
        const gasPrice = BigInt(result.gasPrice || '0');
        const gasCostWei = gasUsed * gasPrice;
        const netWei = result.success ? profitWei - gasCostWei : -gasCostWei;
        const netEth = parseFloat(ethers_1.ethers.formatEther(netWei));
        this.canaryDailyPnlEth += netEth;
        this.logger.info('🧪 Canary PnL update', {
            netEth,
            dailyPnlEth: this.canaryDailyPnlEth,
            maxDailyLossEth: this.botConfig.canaryMaxDailyLossEth
        });
        if (this.canaryDailyPnlEth <= -this.botConfig.canaryMaxDailyLossEth) {
            this.logger.error('🛑 Canary daily loss cap breached after execution. Halting bot.', {
                dailyPnlEth: this.canaryDailyPnlEth,
                maxDailyLossEth: this.botConfig.canaryMaxDailyLossEth
            });
            this.stop();
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
        const walletAddress = this.wallet?.address ?? this.walletAddress;
        if (!walletAddress) {
            if (!this.botConfig.logOnly) {
                throw new Error('Wallet not configured for execution mode (set a valid PRIVATE_KEY or enable LOG_ONLY/BOT_LOG_ONLY=true)');
            }
            this.logger.warn('⚠️ LOG_ONLY: Wallet identity not configured (set WALLET_ADDRESS for identity-only mode); bot will scan only and skip trade execution.');
        }
        if (!this.botConfig.arbExecutorAddress) {
            if (!this.botConfig.logOnly) {
                throw new Error('ArbExecutor address not configured for execution mode (set ARB_EXECUTOR_ADDRESS or enable LOG_ONLY/BOT_LOG_ONLY=true)');
            }
            else {
                this.logger.warn('⚠️ LOG_ONLY: ArbExecutor address not configured; bot will scan only and not execute trades.');
            }
        }
        this.logger.info('Bot setup validated', {
            walletAddress: walletAddress || 'N/A (LOG_ONLY no wallet)',
            executorAddress: this.botConfig.arbExecutorAddress,
            treasuryAddress: this.botConfig.treasuryAddress
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
