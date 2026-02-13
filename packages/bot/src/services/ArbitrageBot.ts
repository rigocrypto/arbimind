import { ethers } from 'ethers';
import { config, TOKEN_PAIRS, type BotConfig } from '../config';
import { DEX_CONFIG } from '../config';
import { ArbitrageOpportunity, PriceQuote, BotStats } from '../types';
import { PriceService } from './PriceService';
import { ExecutionService } from './ExecutionService';
import { Logger } from '../utils/Logger';
import { AiScoringService } from './AiScoringService';
// AI orchestrator imports removed (not used in current flow)

export interface ArbitrageBotDependencies {
  config?: Partial<BotConfig>;
  provider?: ethers.Provider;
  wallet?: ethers.Wallet;
  priceService?: PriceService;
  executionService?: ExecutionService;
  aiScoringService?: AiScoringService;
  logger?: Logger;
  tokenPairs?: Array<{ tokenA: string; tokenB: string }>;
}

export interface BotRunResult {
  opportunitiesFound: number;
  executed: number;
  scoredOpps: number;
}

export class ArbitrageBot {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private priceService: PriceService;
  private executionService: ExecutionService;
  private aiScoringService: AiScoringService | undefined;
  private readonly botConfig: BotConfig;
  private readonly tokenPairs: Array<{ tokenA: string; tokenB: string }>;
  // AI orchestrator currently unused in main loop; keep for future use
  // private aiOrchestrator: AIOrchestrator | undefined;
  private logger: Logger;
  private isRunning: boolean = false;
  private stats: BotStats;
  // last scan timestamp removed (not currently read anywhere)

  constructor(deps: ArbitrageBotDependencies = {}) {
    this.botConfig = { ...config, ...deps.config };
    this.provider = deps.provider ?? new ethers.JsonRpcProvider(this.botConfig.ethereumRpcUrl);
    // Only create wallet if privateKey is valid
    if (
      this.botConfig.privateKey &&
      this.botConfig.privateKey.length === 66 &&
      this.botConfig.privateKey.startsWith('0x')
    ) {
      this.wallet = deps.wallet ?? new ethers.Wallet(this.botConfig.privateKey, this.provider);
      this.logger?.info?.(`✅ Wallet loaded: ${this.wallet.address}`);
    } else {
      this.wallet = undefined as any;
      this.logger?.warn?.('⚠️ LOG_ONLY: No valid PRIVATE_KEY, running without wallet.');
    }
    this.priceService = deps.priceService ?? new PriceService(this.provider);
    this.executionService = deps.executionService ?? new ExecutionService(this.wallet, this.botConfig.arbExecutorAddress);
    const aiConfig = this.botConfig.aiPredictUrl
      ? {
          predictUrl: this.botConfig.aiPredictUrl,
          ...(this.botConfig.aiLogUrl ? { logUrl: this.botConfig.aiLogUrl } : {}),
          ...(this.botConfig.aiServiceKey ? { serviceKey: this.botConfig.aiServiceKey } : {}),
          ...(this.botConfig.aiModelTag ? { modelTag: this.botConfig.aiModelTag } : {}),
          ...(this.botConfig.aiPredictionHorizonSec ? { horizonSec: this.botConfig.aiPredictionHorizonSec } : {})
        }
      : undefined;

    this.aiScoringService = deps.aiScoringService ?? (aiConfig ? new AiScoringService(aiConfig) : undefined);
  // AI orchestrator initialization deferred until used
  // this.aiOrchestrator = new AIOrchestrator();
    this.logger = deps.logger ?? new Logger('ArbitrageBot');
    this.tokenPairs = deps.tokenPairs ?? TOKEN_PAIRS;
    
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
  public async start(): Promise<void> {
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
  public stop(): void {
    this.logger.info('Stopping ArbiMind arbitrage bot...');
    this.isRunning = false;
  }

  /**
   * Get current bot statistics
   */
  public getStats(): BotStats {
    return { ...this.stats };
  }

  /**
   * Main bot loop
   */
  private async runMainLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.scanForOpportunities();
        await this.sleep(this.botConfig.scanIntervalMs);
      } catch (error) {
        this.logger.error('Error in main loop', { error: error instanceof Error ? error.message : error });
        await this.sleep(1000); // Wait longer on error
      }
    }
  }

  /**
   * Run a single scan + execute cycle (useful for tests)
   */
  public async runCycle(): Promise<BotRunResult> {
    return this.scanForOpportunities();
  }

  /**
   * Scan for arbitrage opportunities across all configured pairs and DEXes
   */
  private async scanForOpportunities(): Promise<BotRunResult> {
  const startTime = Date.now();
  let opportunitiesFound = 0;
  let executed = 0;
  let scoredOpps = 0;

    this.logger.debug('Scanning for arbitrage opportunities...');

    for (const pair of this.tokenPairs) {
      try {
        const opportunities = await this.findOpportunitiesForPair(pair.tokenA, pair.tokenB);
        opportunitiesFound += opportunities.length;
        
        for (const opportunity of opportunities) {
          const { approved, scored } = await this.isAiApproved(opportunity);
          if (scored) scoredOpps++;

          if (this.isProfitable(opportunity) && approved) {
            const success = await this.executeArbitrage(opportunity);
            if (success) executed++;
          }
        }
      } catch (error) {
        this.logger.error(`Error scanning pair ${pair.tokenA}-${pair.tokenB}`, { 
          error: error instanceof Error ? error.message : error 
        });
      }
    }

    const scanDuration = Date.now() - startTime;
    this.logger.debug(`Scan completed in ${scanDuration}ms`);

    return { opportunitiesFound, executed, scoredOpps };
  }

  /**
   * Find arbitrage opportunities for a specific token pair
   */
  private async findOpportunitiesForPair(tokenA: string, tokenB: string): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
  const enabledDexes = Object.entries(DEX_CONFIG).filter(([_, cfg]) => cfg.enabled);
    
    // Get quotes from all DEXes
    const quotes: PriceQuote[] = [];
    const amountIn = ethers.parseEther('1'); // 1 ETH base amount

  for (const [dexName] of enabledDexes) {
      try {
        const quote = await this.priceService.getQuote(
          tokenA,
          tokenB,
          amountIn.toString(),
          dexName
        );
        if (quote) {
          quotes.push(quote);
        }
      } catch (error) {
        this.logger.debug(`Failed to get quote from ${dexName}`, { 
          error: error instanceof Error ? error.message : error 
        });
      }
    }

    // Find arbitrage opportunities between different DEXes
    for (let i = 0; i < quotes.length; i++) {
      for (let j = i + 1; j < quotes.length; j++) {
  const quote1 = quotes[i] as PriceQuote;
  const quote2 = quotes[j] as PriceQuote;

  if (!quote1 || !quote2) continue;

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
  private calculateArbitrageOpportunity(
    quote1: PriceQuote,
    quote2: PriceQuote,
    amountIn: string
  ): ArbitrageOpportunity | null {
    const amountInBig = ethers.getBigInt(amountIn);
    const amountOut1Big = ethers.getBigInt(quote1.amountOut);
    const amountOut2Big = ethers.getBigInt(quote2.amountOut);

    // Calculate profit (assuming we buy on DEX1 and sell on DEX2)
    const profit = amountOut2Big > amountOut1Big ? amountOut2Big - amountOut1Big : ethers.getBigInt(0);
    
    if (profit <= 0) {
      return null;
    }

    // Estimate gas costs
    const gasEstimate = this.estimateGasCost();
    const netProfit = profit - ethers.getBigInt(gasEstimate.totalCost);

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
  private isProfitable(opportunity: ArbitrageOpportunity): boolean {
    const netProfitEth = ethers.formatEther(opportunity.netProfit);
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

  private async isAiApproved(opportunity: ArbitrageOpportunity): Promise<{ approved: boolean; scored: boolean }> {
    if (!this.aiScoringService) return { approved: true, scored: false };

    try {
      const prediction = await this.aiScoringService.scoreOpportunity(opportunity, {
        chain: 'evm',
        pairAddress: `${opportunity.tokenA}-${opportunity.tokenB}`
      });
      if (!prediction) return { approved: true, scored: true };

      const approved =
        prediction.successProb >= this.botConfig.aiMinSuccessProb &&
        prediction.expectedProfitPct >= this.botConfig.aiMinExpectedProfitPct;

      if (!approved) {
        this.logger.debug('AI rejected opportunity', {
          successProb: prediction.successProb,
          expectedProfitPct: prediction.expectedProfitPct
        });
      }

      return { approved, scored: true };
    } catch (error) {
      this.logger.debug('AI scoring failed, defaulting to execute', {
        error: error instanceof Error ? error.message : error
      });
      return { approved: true, scored: true };
    }
  }

  /**
   * Execute an arbitrage opportunity
   */
  private async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<boolean> {
    if (this.botConfig.logOnly) {
      this.logger.info('Testnet mode: skipping real execution', {
        tokenA: opportunity.tokenA,
        tokenB: opportunity.tokenB,
        dex1: opportunity.dex1,
        dex2: opportunity.dex2,
        profit: ethers.formatEther(opportunity.profit),
        netProfit: ethers.formatEther(opportunity.netProfit)
      });
      return true;
    }

    this.logger.info('Executing arbitrage opportunity', {
      tokenA: opportunity.tokenA,
      tokenB: opportunity.tokenB,
      dex1: opportunity.dex1,
      dex2: opportunity.dex2,
      profit: ethers.formatEther(opportunity.profit),
      netProfit: ethers.formatEther(opportunity.netProfit)
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
          profit: ethers.formatEther(result.profit),
          gasUsed: result.gasUsed
        });
        this.updateStats();
        return true;
      } else {
        this.stats.failedTrades++;
        this.logger.error('Arbitrage execution failed', {
          error: result.error,
          gasUsed: result.gasUsed
        });
        this.updateStats();
        return false;
      }
    } catch (error) {
      this.stats.failedTrades++;
      this.logger.error('Error executing arbitrage', { 
        error: error instanceof Error ? error.message : error 
      });
      this.updateStats();
      return false;
    }
  }

  /**
   * Estimate gas costs for arbitrage execution
   */
  private estimateGasCost(): { totalCost: string } {
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
  private getCurrentGasPrice(): number {
    // This would typically come from a gas price oracle
    // For now, return a conservative estimate
    return 20 * 1e9; // 20 gwei in wei
  }

  /**
   * Update bot statistics
   */
  private updateStats(): void {
    const totalTrades = this.stats.successfulTrades + this.stats.failedTrades;
    this.stats.successRate = totalTrades > 0 ? (this.stats.successfulTrades / totalTrades) * 100 : 0;
    
    if (this.stats.successfulTrades > 0) {
      this.stats.averageProfit = (BigInt(this.stats.totalProfit) / BigInt(this.stats.successfulTrades)).toString();
    }
  }

  /**
   * Validate bot setup
   */
  private validateSetup(): void {
    if (!this.wallet.address) {
      throw new Error('Invalid wallet configuration');
    }

    if (!this.botConfig.arbExecutorAddress) {
      throw new Error('ArbExecutor address not configured');
    }

    this.logger.info('Bot setup validated', {
      walletAddress: this.wallet.address,
      executorAddress: this.botConfig.arbExecutorAddress,
      treasuryAddress: this.botConfig.treasuryAddress
    });
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
