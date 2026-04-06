import { ethers } from 'ethers';
import { config, type BotConfig } from '../config';
import { DEX_CONFIG } from '../config';
import { type DexConfig, getEligibleDexesForPair } from '../config/dexes';
import { getTokenConfig, getEffectiveTokenPairs } from '../config/tokens';
import { ArbitrageOpportunity, PriceQuote, BotStats } from '../types';
import { PriceService } from './PriceService';
import { ExecutionService, type ExecutionOverrides } from './ExecutionService';
import { Logger } from '../utils/Logger';
import { AiScoringService } from './AiScoringService';
import { AlertService } from './AlertService';
import { SettingsReader, type RuntimeSettings } from './SettingsReader';

/** Tokens considered stablecoins for quote sanity filtering */
const STABLE_TOKENS = new Set(['USDC', 'USDT', 'DAI']);

/** Maximum spread (bps) before a cross-DEX pair is flagged as suspicious */
const MAX_SANE_SPREAD_BPS = 1000; // 10%

/** Stable/stable price must be within this range to be considered valid */
const STABLE_PAIR_MIN_PRICE = 0.95;
const STABLE_PAIR_MAX_PRICE = 1.05;

export interface ArbitrageBotDependencies {
  config?: Partial<BotConfig>;
  provider?: ethers.Provider;
  wallet?: ethers.Wallet;
  priceService?: PriceService;
  executionService?: ExecutionService;
  aiScoringService?: AiScoringService;
  alertService?: AlertService;
  logger?: Logger;
  tokenPairs?: Array<{ tokenA: string; tokenB: string }>;
}

export interface BotRunResult {
  opportunitiesFound: number;
  executed: number;
  scoredOpps: number;
  quotesOk: number;
  quotesFailed: number;
  scanDurationMs: number;
}

export class ArbitrageBot {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet | undefined;
  private walletAddress: string;
  private priceService: PriceService;
  private executionService: ExecutionService | undefined;
  private aiScoringService: AiScoringService | undefined;
  private alertService: AlertService;
  private readonly botConfig: BotConfig;
  private readonly tokenPairs: Array<{ tokenA: string; tokenB: string }>;
  // AI orchestrator currently unused in main loop; keep for future use
  // private aiOrchestrator: AIOrchestrator | undefined;
  private logger: Logger;
  private isRunning: boolean = false;
  private readonly settingsReader: SettingsReader;
  private stats: BotStats;
  private canaryDailyPnlEth: number = 0;
  private canaryDay: string = new Date().toISOString().slice(0, 10);
  private lastSanityTxAtMs: number = 0;
  private cachedGasPriceWei: number = 20e9; // fallback 20 gwei, refreshed from provider
  private lastGasPriceRefreshMs: number = 0;
  /** Cached ETH/USD price derived from WETH/USDC quotes. Used to convert gas
   *  costs when the input token is not ETH (e.g. USDC/USDT stable pairs). */
  private cachedEthPriceUsd: number = 2000; // conservative fallback
  // last scan timestamp removed (not currently read anywhere)
  private heartbeatUrl: string | null = null;

  constructor(deps: ArbitrageBotDependencies = {}) {
    this.logger = deps.logger ?? new Logger('ArbitrageBot');
    this.botConfig = { ...config, ...deps.config };
    this.provider = deps.provider ?? new ethers.JsonRpcProvider(this.botConfig.ethereumRpcUrl);
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
      this.botConfig.privateKey.startsWith('0x')
    ) {
      this.wallet = new ethers.Wallet(this.botConfig.privateKey, this.provider);
      this.walletAddress = this.wallet.address;
      this.logger.info(`✅ Wallet loaded: ${this.walletAddress}`);
    }

    if (!this.wallet) {
      if (this.walletAddress) {
        this.logger.warn(`⚠️ LOG_ONLY: No valid PRIVATE_KEY, using WALLET_ADDRESS fallback: ${this.walletAddress}`);
      } else {
        this.logger.warn('⚠️ LOG_ONLY: No valid PRIVATE_KEY and no WALLET_ADDRESS fallback, running without wallet identity.');
      }
    }
    this.priceService = deps.priceService ?? new PriceService(this.provider);
    if (deps.executionService) {
      this.executionService = deps.executionService;
    } else if (this.wallet) {
      this.executionService = new ExecutionService(this.wallet, this.botConfig.arbExecutorAddress);
    } else {
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

    this.aiScoringService = deps.aiScoringService ?? (aiConfig ? new AiScoringService(aiConfig) : undefined);
    this.alertService = deps.alertService ?? new AlertService(this.botConfig.alertDiscordWebhook);
    // AI orchestrator initialization deferred until used
    // this.aiOrchestrator = new AIOrchestrator();
    this.tokenPairs = deps.tokenPairs ?? getEffectiveTokenPairs();

    console.log('[SCANNER_INIT]', {
      pairsLoaded: this.tokenPairs.length,
      pairs: this.tokenPairs.map((p) => `${p.tokenA}/${p.tokenB}`),
    });

    console.log('[PROFITABILITY_CONFIG]', {
      swapAmountEth: this.botConfig.swapAmountEth,
      minProfitEth: this.botConfig.minProfitEth,
      minEdgeBps: this.botConfig.minEdgeBps,
      maxGasGwei: this.botConfig.maxGasGwei,
      maxSlippageBps: this.botConfig.maxSlippageBps,
      maxTradeSizeEth: this.botConfig.maxTradeSizeEth,
      maxGasUsd: this.botConfig.maxGasUsd,
      minProfitUsd: this.botConfig.minProfitUsd,
      logOnly: this.botConfig.logOnly,
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

    // SettingsReader — fetches runtime-adjustable settings from the backend API.
    // Falls back to env-var defaults when the backend is unreachable.
    this.settingsReader = new SettingsReader({
      envDefaults: {
        autoTrade: !this.botConfig.logOnly,
        minProfitEth: this.botConfig.minProfitEth,
        maxGasGwei: this.botConfig.maxGasGwei,
        slippagePct: 0.5,           // historical hardcoded default
        requiredConfirmations: 1,   // ethers tx.wait() default
      },
    });

    // Heartbeat URL — POST scan metrics to the backend after each cycle
    const backendBase = (
      process.env['BACKEND_URL'] ||
      process.env['SETTINGS_API_URL']?.replace(/\/api\/settings\/?$/, '') ||
      ''
    ).replace(/\/+$/, '');
    this.heartbeatUrl = backendBase ? `${backendBase}/api/bot/heartbeat` : null;
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

    // Log RPC/chain diagnostics
    try {
      const network = await this.provider.getNetwork();
      const latestBlock = await this.provider.getBlockNumber();
      const rpcHost = this.botConfig.ethereumRpcUrl
        ? new URL(this.botConfig.ethereumRpcUrl).host
        : 'unknown';
      console.log('[RPC_BOOT]', {
        network: this.botConfig.network,
        evmChain: this.botConfig.evmChain,
        chainId: Number(network.chainId),
        rpcHost,
        latestBlock,
      });
    } catch (e) {
      console.warn('[RPC_BOOT] diagnostics failed:', e instanceof Error ? e.message : e);
    }

    // Validate configuration
    this.validateSetup();

    // One-time token approvals for Sepolia routers (before scan loop)
    const isSepolia = this.botConfig.network === 'testnet' && this.botConfig.evmChain === 'ethereum';
    if (isSepolia && this.executionService && !this.botConfig.logOnly) {
      try {
        await this.executionService.ensureSepoliaRouterApprovals();
      } catch (e) {
        this.logger.warn('Sepolia router approvals failed (non-fatal)', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (isSepolia && this.botConfig.logOnly) {
      this.logger.info('LOG_ONLY enabled: skipping router approval transactions');
    }

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
        await this.refreshGasPrice();
        await this.maybeRunSanityTransfer();
        const result = await this.scanForOpportunities();
        this.sendHeartbeat(result);   // fire-and-forget
        await this.sleep(this.botConfig.scanIntervalMs);
      } catch (error) {
        this.logger.error('Error in main loop', { error: error instanceof Error ? error.message : error });
        await this.sleep(1000); // Wait longer on error
      }
    }
  }

  /**
   * Fire-and-forget heartbeat POST to the backend after each scan cycle.
   * Failures are silently logged at debug level — never blocks the main loop.
   */
  private sendHeartbeat(result: BotRunResult): void {
    if (!this.heartbeatUrl) return;

    const payload = {
      service: 'evm-arbitrage',
      status: 'running',
      mode: this.botConfig.logOnly ? 'dry-run' : 'live',
      lastScanAt: new Date().toISOString(),
      scanDurationMs: result.scanDurationMs,
      pairsChecked: this.tokenPairs.length,
      quotesOk: result.quotesOk,
      quotesFailed: result.quotesFailed,
      opportunitiesFound: result.opportunitiesFound,
      autoTrade: !this.botConfig.logOnly,
    };

    fetch(this.heartbeatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.botConfig.aiServiceKey ? { 'X-SERVICE-KEY': this.botConfig.aiServiceKey } : {}),
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.debug('[HEARTBEAT_FAIL]', err instanceof Error ? err.message : err);
    });
  }

  private async maybeRunSanityTransfer(): Promise<void> {
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
        console.log(
          `[SANITY_BALANCE] wallet=${this.walletAddress} balanceWei=${balanceWei.toString()} balanceEth=${ethers.formatEther(balanceWei)}`
        );
      } catch (error) {
        console.error(
          `[SANITY_BALANCE_FAIL] error=${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    console.log(
      `[SANITY_ATTEMPT] ts=${new Date().toISOString()} to=${to} valueWei=${this.botConfig.sanityTxWei}`
    );

    const result = await this.executionService.executeSanityTransfer(to, this.botConfig.sanityTxWei);
    if (result.success) {
      console.log(
        `[SANITY_OK] hash=${result.hash} gasUsed=${result.gasUsed} gasPrice=${result.gasPrice}`
      );
    } else {
      console.error(
        `[SANITY_FAIL] error=${result.error || 'unknown'}`
      );
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
    let quotesOk = 0;
    let quotesFailed = 0;

    // Fetch runtime settings (cached, refreshed every ~30s)
    const runtimeSettings = await this.settingsReader.get();

    this.logger.debug('Scanning for arbitrage opportunities...');
    console.log('[SCAN_START]', { pairsCount: this.tokenPairs.length });

    for (const pair of this.tokenPairs) {
      try {
        const { opportunities, quotesOk: ok, quotesFailed: fail } = await this.findOpportunitiesForPair(
          pair.tokenA,
          pair.tokenB
        );
        quotesOk += ok;
        quotesFailed += fail;
        opportunitiesFound += opportunities.length;

        for (const opportunity of opportunities) {
          // TEMP DEBUG — remove after sizing verification
          const _inputIsEth = opportunity.decimalsIn === 18 && opportunity.tokenA === 'WETH';
          const _netProfitFormatted = parseFloat(ethers.formatUnits(opportunity.netProfit, opportunity.decimalsIn));
          const _netProfitUsd = _inputIsEth
            ? _netProfitFormatted * this.cachedEthPriceUsd
            : _netProfitFormatted; // stablecoin ≈ $1
          console.log('[TRADE_SIZING_SANITY]', {
            swapAmountEth: this.botConfig.swapAmountEth,
            amountInRaw: opportunity.amountIn,
            amountInFormatted: ethers.formatUnits(opportunity.amountIn, opportunity.decimalsIn),
            decimalsIn: opportunity.decimalsIn,
            tokenA: opportunity.tokenA,
            tokenB: opportunity.tokenB,
            route: opportunity.route,
            grossProfitOutput: ethers.formatUnits(opportunity.profit, opportunity.decimalsOut),
            netProfitInput: ethers.formatUnits(opportunity.netProfit, opportunity.decimalsIn),
            netProfitUsd: _netProfitUsd.toFixed(4),
            gasEstimateWei: opportunity.gasEstimate,
            gasEstimateEth: ethers.formatEther(opportunity.gasEstimate),
            cachedEthPriceUsd: this.cachedEthPriceUsd,
            profitPercent: opportunity.profitPercent.toFixed(4),
          });

          const { approved, scored } = await this.isAiApproved(opportunity);
          if (scored) scoredOpps++;

          // Gate 1: isProfitable() — loose ETH-denominated sanity check (MIN_PROFIT_ETH)
          // Gate 2: passesTradeGuards() — authoritative USD floor (MIN_PROFIT_USD)
          if (this.isProfitable(opportunity, runtimeSettings) && this.passesTradeGuards(opportunity) && approved) {
            const success = await this.executeArbitrage(opportunity, runtimeSettings);
            if (success) executed++;
          }
        }
      } catch (error) {
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

    return { opportunitiesFound, executed, scoredOpps, quotesOk, quotesFailed, scanDurationMs: scanDuration };
  }

  /**
   * Check if a pair is a stable/stable pair (both tokens are stablecoins)
   */
  private isStablePair(tokenA: string, tokenB: string): boolean {
    return STABLE_TOKENS.has(tokenA) && STABLE_TOKENS.has(tokenB);
  }

  /**
   * Sanity-check a quote's normalized price.
   * Returns true if the quote should be kept, false if it should be rejected.
   */
  private isQuoteSane(
    tokenA: string,
    tokenB: string,
    normalizedPrice: number,
    dex: string
  ): boolean {
    // Stable/stable guard — price must be near 1:1
    if (this.isStablePair(tokenA, tokenB)) {
      if (normalizedPrice < STABLE_PAIR_MIN_PRICE || normalizedPrice > STABLE_PAIR_MAX_PRICE) {
        console.log('[QUOTE_SANITY_REJECT]', {
          pair: `${tokenA}/${tokenB}`,
          dex,
          normalizedPrice,
          reason: 'stable_pair_out_of_range',
          range: `${STABLE_PAIR_MIN_PRICE}-${STABLE_PAIR_MAX_PRICE}`,
        });
        return false;
      }
    }

    // Reject obviously implausible quotes (zero or negative)
    if (normalizedPrice <= 0 || !isFinite(normalizedPrice)) {
      console.log('[QUOTE_SANITY_REJECT]', {
        pair: `${tokenA}/${tokenB}`,
        dex,
        normalizedPrice,
        reason: 'invalid_price',
      });
      return false;
    }

    return true;
  }

  /**
   * Log diagnostic info for a V2/SushiSwap pair when spread seems suspicious.
   * Attempts to fetch on-chain reserves from the pair contract.
   */
  private async logPairDiagnostics(
    tokenA: string,
    tokenB: string,
    dexName: string,
    dexConfig: DexConfig,
    spreadBps: number
  ): Promise<void> {
    // Only run diagnostics for V2-style DEXes with a factory
    if (dexConfig.version !== 'v2' || !dexConfig.factory) return;

    try {
      const tokenAAddr = getTokenConfig(tokenA).address;
      const tokenBAddr = getTokenConfig(tokenB).address;
      const factoryAbi = ['function getPair(address,address) view returns (address)'];
      const factory = new ethers.Contract(dexConfig.factory, factoryAbi, this.provider);
      const pairAddress: string = await factory.getPair(tokenAAddr, tokenBAddr);

      if (!pairAddress || pairAddress === ethers.ZeroAddress) {
        console.log('[PAIR_DIAGNOSTIC]', {
          dex: dexName,
          pair: `${tokenA}/${tokenB}`,
          pairAddress: 'NO_PAIR',
          note: 'No direct pair exists — quote may route through intermediary',
        });
        return;
      }

      const pairAbi = [
        'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() view returns (address)',
        'function token1() view returns (address)',
      ];
      const pairContract = new ethers.Contract(pairAddress, pairAbi, this.provider);
      const [reserves, token0] = await Promise.all([
        pairContract.getReserves(),
        pairContract.token0(),
      ]);

      const isToken0A = token0.toLowerCase() === tokenAAddr.toLowerCase();
      const decimalsA = getTokenConfig(tokenA).decimals;
      const decimalsB = getTokenConfig(tokenB).decimals;

      console.log('[PAIR_DIAGNOSTIC]', {
        dex: dexName,
        pair: `${tokenA}/${tokenB}`,
        pairAddress,
        token0: isToken0A ? tokenA : tokenB,
        token1: isToken0A ? tokenB : tokenA,
        reserve0: ethers.formatUnits(reserves[0], isToken0A ? decimalsA : decimalsB),
        reserve1: ethers.formatUnits(reserves[1], isToken0A ? decimalsB : decimalsA),
        spreadBps: spreadBps.toFixed(2),
      });
    } catch (error) {
      console.log('[PAIR_DIAGNOSTIC]', {
        dex: dexName,
        pair: `${tokenA}/${tokenB}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Find arbitrage opportunities for a specific token pair
   */
  private async findOpportunitiesForPair(
    tokenA: string,
    tokenB: string
  ): Promise<{ opportunities: ArbitrageOpportunity[]; quotesOk: number; quotesFailed: number }> {
    const opportunities: ArbitrageOpportunity[] = [];
    const enabledDexes = getEligibleDexesForPair(tokenA, tokenB);
    this.logger.info(`[DEX_ELIGIBILITY] ${tokenA}/${tokenB} → ${enabledDexes.map(([n]) => n).join(', ')}`);
    let quotesOk = 0;
    let quotesFailed = 0;

    const quotes: PriceQuote[] = [];
    const decimalsIn = getTokenConfig(tokenA).decimals;
    const decimalsOut = getTokenConfig(tokenB).decimals;
    const amountIn = ethers.parseUnits(
      String(this.botConfig.swapAmountEth ?? 0.001),
      decimalsIn
    );

    for (const [dexName] of enabledDexes) {
      try {
        const quote = await this.priceService.getQuote(
          tokenA,
          tokenB,
          amountIn.toString(),
          dexName
        );
        if (quote) {
          // Sanity-check the normalized price before accepting the quote
          const normalizedPrice =
            (Number(quote.amountOut) / 10 ** decimalsOut) /
            (Number(amountIn) / 10 ** decimalsIn);

          if (this.isQuoteSane(tokenA, tokenB, normalizedPrice, quote.dex)) {
            quotes.push(quote);
            quotesOk++;
            this.logger.debug('[QUOTE]', {
              pair: `${tokenA}/${tokenB}`,
              dex: quote.dex,
              fee: quote.fee,
              amountIn: amountIn.toString(),
              amountOut: quote.amountOut,
              normalizedPrice,
            });
          } else {
            quotesFailed++;
          }
        } else {
          quotesFailed++;
        }
      } catch (error) {
        quotesFailed++;
        this.logger.debug(`Failed to get quote from ${dexName}`, {
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const amountInNum = Number(amountIn.toString());
    const quotesByDex: Record<string, number | 'null'> = {};
    for (const q of quotes) {
      quotesByDex[q.dex] =
        (Number(q.amountOut) / 10 ** decimalsOut) / (amountInNum / 10 ** decimalsIn);
    }
    console.log('[QUOTE_RESULT]', {
      pair: `${tokenA}/${tokenB}`,
      ...quotesByDex,
    });

    // Update cached ETH/USD price from WETH→stablecoin quotes
    if (tokenA === 'WETH' && STABLE_TOKENS.has(tokenB) && quotes.length > 0) {
      const bestQuote = quotes[0]!;
      const ethPrice = (Number(bestQuote.amountOut) / 10 ** decimalsOut) /
                        (amountInNum / 10 ** decimalsIn);
      if (ethPrice > 0 && isFinite(ethPrice)) {
        this.cachedEthPriceUsd = ethPrice;
      }
    }

    // Find arbitrage opportunities between different DEXes (with spread threshold)
    const minEdgeBps = this.botConfig.minEdgeBps ?? 10;

    for (let i = 0; i < quotes.length; i++) {
      for (let j = i + 1; j < quotes.length; j++) {
        const quote1 = quotes[i] as PriceQuote;
        const quote2 = quotes[j] as PriceQuote;
        if (!quote1 || !quote2) continue;

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

        if (spreadBps < minEdgeBps) continue;

        // Reject suspiciously large spreads — likely bad quote or thin liquidity
        if (spreadBps > MAX_SANE_SPREAD_BPS) {
          console.log('[SPREAD_SANITY_REJECT]', {
            pair: `${tokenA}/${tokenB}`,
            spreadBps: spreadBps.toFixed(2),
            maxSaneBps: MAX_SANE_SPREAD_BPS,
            dex1: quote1.dex,
            dex2: quote2.dex,
          });

          // Fire diagnostics for V2-style DEXes to log on-chain reserves
          for (const q of [quote1, quote2]) {
            const dexCfg = DEX_CONFIG[q.dex];
            if (dexCfg) {
              // Fire-and-forget — don't block the scan loop
              this.logPairDiagnostics(tokenA, tokenB, q.dex, dexCfg, spreadBps).catch(() => {});
            }
          }
          continue;
        }

        const opportunity = this.calculateArbitrageOpportunity(
          quote1, quote2, amountIn.toString(), decimalsIn, decimalsOut
        );
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
   * Calculate arbitrage opportunity between two quotes.
   *
   * `profit` (amountOut difference) is denominated in the **output token** (tokenB)
   * which may have different decimals than ETH (e.g. USDC = 6).  Gas cost is always
   * in wei (18 decimals).  To compare them we convert profit to ETH-equivalent wei
   * using the quote's implied price: profitEthWei = profit * amountIn / amountOut
   * (since amountIn is in the input token which for WETH pairs is already in wei).
   */
  private calculateArbitrageOpportunity(
    quote1: PriceQuote,
    quote2: PriceQuote,
    amountIn: string,
    decimalsIn: number,
    decimalsOut: number
  ): ArbitrageOpportunity | null {
    const amountInBig = ethers.getBigInt(amountIn);
    const amountOut1Big = ethers.getBigInt(quote1.amountOut);
    const amountOut2Big = ethers.getBigInt(quote2.amountOut);

    // Calculate profit (assuming we buy on DEX1 and sell on DEX2)
    let buyQuote: PriceQuote;
    let sellQuote: PriceQuote;
    let profit: bigint;
    if (amountOut2Big > amountOut1Big) {
      // DEX2 gives more output — buy on DEX1 (cheaper), sell on DEX2 (pricier)
      buyQuote = quote1;
      sellQuote = quote2;
      profit = amountOut2Big - amountOut1Big;
    } else if (amountOut1Big > amountOut2Big) {
      // DEX1 gives more output — buy on DEX2, sell on DEX1
      buyQuote = quote2;
      sellQuote = quote1;
      profit = amountOut1Big - amountOut2Big;
    } else {
      return null;
    }

    // Convert profit from output-token units to input-token units using the
    // average of the two quotes as the conversion rate.
    // profitInInputUnits = profit * amountIn / avgAmountOut
    // This gives us a like-for-like comparison with gas cost (both in input-token units,
    // which for WETH pairs is wei).
    const avgAmountOut = (amountOut1Big + amountOut2Big) / 2n;
    let profitInInputUnits: bigint;
    if (decimalsIn === decimalsOut) {
      // Same decimals (e.g. USDC/USDT) — profit is already directly comparable
      profitInInputUnits = profit;
    } else if (avgAmountOut > 0n) {
      profitInInputUnits = (profit * amountInBig) / avgAmountOut;
    } else {
      return null;
    }

    // Estimate gas costs — always computed in wei.
    // For WETH-input pairs, profitInInputUnits is already in wei → direct comparison.
    // For non-ETH input (e.g. USDC/USDT), convert gas from wei → input-token units
    // using cachedEthPriceUsd.
    const gasEstimate = this.estimateGasCost();
    const gasCostWei = ethers.getBigInt(gasEstimate.totalCost);
    let gasCostInInputUnits: bigint;

    const inputIsEth = decimalsIn === 18 && buyQuote.tokenIn === 'WETH';
    if (inputIsEth) {
      gasCostInInputUnits = gasCostWei;
    } else {
      // Convert gas (wei) → ETH → USD → input-token raw units
      const gasCostEth = Number(gasCostWei) / 1e18;
      const gasCostUsd = gasCostEth * this.cachedEthPriceUsd;
      // For stablecoins 1 USD ≈ 1 token unit; scale to raw units
      gasCostInInputUnits = BigInt(Math.ceil(gasCostUsd * 10 ** decimalsIn));
    }
    const netProfit = profitInInputUnits - gasCostInInputUnits;

    if (netProfit <= 0n) {
      console.log('[OPP_REJECTED_GAS]', {
        pair: `${buyQuote.tokenIn}/${buyQuote.tokenOut}`,
        route: `${buyQuote.dex} -> ${sellQuote.dex}`,
        grossProfitOutputUnits: profit.toString(),
        grossProfitOutput: Number(profit) / 10 ** decimalsOut,
        profitInInputUnits: profitInInputUnits.toString(),
        profitInInputFormatted: ethers.formatUnits(profitInInputUnits, decimalsIn),
        gasCostWei: gasEstimate.totalCost,
        gasCostEth: ethers.formatEther(gasEstimate.totalCost),
        gasCostInInputUnits: gasCostInInputUnits.toString(),
        inputIsEth,
        cachedEthPriceUsd: this.cachedEthPriceUsd,
        netProfitInputUnits: netProfit.toString(),
        amountIn,
        swapAmountEth: this.botConfig.swapAmountEth,
        cachedGasPriceGwei: (this.cachedGasPriceWei / 1e9).toFixed(4),
        decimalsIn,
        decimalsOut,
      });
      return null;
    }

    const profitPercent = (Number(profitInInputUnits) / Number(amountInBig)) * 100;

    return {
      tokenA: buyQuote.tokenIn,
      tokenB: buyQuote.tokenOut,
      dex1: buyQuote.dex,
      dex2: sellQuote.dex,
      amountIn,
      amountOut1: buyQuote.amountOut,
      amountOut2: sellQuote.amountOut,
      profit: profit.toString(),
      profitPercent,
      gasEstimate: gasEstimate.totalCost,
      netProfit: netProfit.toString(),
      decimalsIn,
      decimalsOut,
      route: `${buyQuote.dex} -> ${sellQuote.dex}`,
      timestamp: Date.now()
    };
  }

  /**
   * Check if an opportunity is profitable enough to execute.
   *
   * `netProfit` is denominated in input-token units (wei for WETH pairs,
   * raw token units for others).  We convert to ETH-equivalent before
   * comparing against `minProfitEth`.
   */
  private isProfitable(opportunity: ArbitrageOpportunity, rs?: RuntimeSettings): boolean {
    const decimals = opportunity.decimalsIn;
    const inputIsEth = decimals === 18 && opportunity.tokenA === 'WETH';

    let netProfitEth: number;
    if (inputIsEth) {
      netProfitEth = parseFloat(ethers.formatEther(opportunity.netProfit));
    } else {
      // Convert input-token profit → ETH via cached ETH/USD price
      const profitInTokenUnits = parseFloat(ethers.formatUnits(opportunity.netProfit, decimals));
      // For stablecoins, 1 token ≈ $1
      netProfitEth = profitInTokenUnits / this.cachedEthPriceUsd;
    }

    // Use runtime settings from backend if available, otherwise env-var default
    const minProfitEth = rs?.minProfitEth ?? this.botConfig.minProfitEth;

    if (netProfitEth < minProfitEth) {
      console.log('[OPP_REJECTED_MIN_PROFIT]', {
        pair: `${opportunity.tokenA}/${opportunity.tokenB}`,
        route: opportunity.route,
        netProfitEth: netProfitEth.toFixed(8),
        minProfitEth,
        minProfitSource: rs ? 'settings-api' : 'env',
        shortfall: (minProfitEth - netProfitEth).toFixed(6),
        decimalsIn: decimals,
        inputIsEth,
        cachedEthPriceUsd: this.cachedEthPriceUsd,
      });
      return false;
    }

    // Check gas price — use runtime maxGasGwei if available
    const maxGasGwei = rs?.maxGasGwei ?? this.botConfig.maxGasGwei;
    const currentGasPrice = this.getCurrentGasPrice();
    const currentGasGwei = currentGasPrice / 1e9;
    if (currentGasGwei > maxGasGwei) {
      console.log('[OPP_REJECTED_GAS_PRICE]', {
        pair: `${opportunity.tokenA}/${opportunity.tokenB}`,
        currentGasGwei: currentGasGwei.toFixed(4),
        maxGasGwei,
        maxGasSource: rs ? 'settings-api' : 'env',
      });
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
   * Hard trading guards — block execution if any limit is exceeded.
   * Runs AFTER isProfitable (which handles min profit ETH / gas price checks).
   */
  private passesTradeGuards(opportunity: ArbitrageOpportunity): boolean {
    const decimals = opportunity.decimalsIn;
    const inputIsEth = decimals === 18 && opportunity.tokenA === 'WETH';
    const pair = `${opportunity.tokenA}/${opportunity.tokenB}`;

    // --- Position size cap ---
    const amountInFormatted = parseFloat(ethers.formatUnits(opportunity.amountIn, decimals));
    const amountInEth = inputIsEth ? amountInFormatted : amountInFormatted / this.cachedEthPriceUsd;
    if (amountInEth > this.botConfig.maxTradeSizeEth) {
      console.log('[GUARD_BLOCK_POSITION_SIZE]', {
        pair,
        route: opportunity.route,
        amountInEth: amountInEth.toFixed(6),
        maxTradeSizeEth: this.botConfig.maxTradeSizeEth,
      });
      this.alertService.guardBlocked({
        pair,
        route: opportunity.route,
        guard: 'MAX_TRADE_SIZE_ETH',
        reason: `Position ${amountInEth.toFixed(6)} ETH exceeds cap ${this.botConfig.maxTradeSizeEth} ETH`,
      }).catch(() => {});
      return false;
    }

    // --- Gas cost USD cap ---
    const gasCostWei = parseFloat(opportunity.gasEstimate);
    const gasCostEth = gasCostWei / 1e18;
    const gasCostUsd = gasCostEth * this.cachedEthPriceUsd;
    if (gasCostUsd > this.botConfig.maxGasUsd) {
      console.log('[GUARD_BLOCK_GAS_USD]', {
        pair,
        route: opportunity.route,
        gasCostUsd: gasCostUsd.toFixed(4),
        maxGasUsd: this.botConfig.maxGasUsd,
      });
      this.alertService.guardBlocked({
        pair,
        route: opportunity.route,
        guard: 'MAX_GAS_USD',
        reason: `Gas $${gasCostUsd.toFixed(4)} exceeds cap $${this.botConfig.maxGasUsd}`,
      }).catch(() => {});
      return false;
    }

    // --- Min net profit USD ---
    let netProfitUsd: number;
    if (inputIsEth) {
      const netProfitEth = parseFloat(ethers.formatEther(opportunity.netProfit));
      netProfitUsd = netProfitEth * this.cachedEthPriceUsd;
    } else {
      // Stablecoin input: 1 token ≈ $1
      netProfitUsd = parseFloat(ethers.formatUnits(opportunity.netProfit, decimals));
    }
    if (netProfitUsd < this.botConfig.minProfitUsd) {
      console.log('[GUARD_BLOCK_MIN_PROFIT_USD]', {
        pair,
        route: opportunity.route,
        netProfitUsd: netProfitUsd.toFixed(4),
        minProfitUsd: this.botConfig.minProfitUsd,
      });
      // No alert for this — it's a normal skip, not an anomaly
      return false;
    }

    return true;
  }

  /**
   * Execute an arbitrage opportunity
   */
  private async executeArbitrage(opportunity: ArbitrageOpportunity, rs?: RuntimeSettings): Promise<boolean> {
    if (this.botConfig.canaryEnabled) {
      this.resetCanaryDayIfNeeded();

      if (this.canaryDailyPnlEth <= -this.botConfig.canaryMaxDailyLossEth) {
        this.logger.error('🛑 Canary daily loss cap reached. Halting bot.', {
          dailyPnlEth: this.canaryDailyPnlEth,
          maxDailyLossEth: this.botConfig.canaryMaxDailyLossEth
        });
        this.alertService.botStopped(
          `Canary daily loss cap reached: ${this.canaryDailyPnlEth.toFixed(6)} ETH (max ${this.botConfig.canaryMaxDailyLossEth} ETH)`
        ).catch(() => {});
        this.stop();
        return false;
      }

      const amountInFormatted = parseFloat(ethers.formatUnits(opportunity.amountIn, opportunity.decimalsIn));
      // For non-ETH input, convert to ETH-equivalent for canary comparison
      const amountInEth = opportunity.tokenA === 'WETH' ? amountInFormatted : amountInFormatted / this.cachedEthPriceUsd;
      if (amountInEth > this.botConfig.canaryNotionalEth) {
        this.logger.info('🧪 Canary skip: opportunity exceeds max notional', {
          amountInEth,
          canaryNotionalEth: this.botConfig.canaryNotionalEth,
          route: opportunity.route
        });
        return false;
      }
    }

    // autoTrade gate: if runtime settings say autoTrade=false, behave like logOnly
    const autoTradeDisabled = rs && !rs.autoTrade;

    if (this.botConfig.logOnly || autoTradeDisabled) {
      const reason = this.botConfig.logOnly ? 'LOG_ONLY=true (env)' : 'autoTrade=false (settings-api)';
      console.log(
        `[EXECUTE_SKIP] reason=${reason} route=${opportunity.route} tokenA=${opportunity.tokenA} tokenB=${opportunity.tokenB} netProfit=${ethers.formatUnits(opportunity.netProfit, opportunity.decimalsIn)} profit=${ethers.formatUnits(opportunity.profit, opportunity.decimalsOut)}`
      );
      this.logger.info(`Dry-run mode: skipping real execution (${reason})`, {
        tokenA: opportunity.tokenA,
        tokenB: opportunity.tokenB,
        dex1: opportunity.dex1,
        dex2: opportunity.dex2,
        profit: ethers.formatUnits(opportunity.profit, opportunity.decimalsOut),
        netProfit: ethers.formatUnits(opportunity.netProfit, opportunity.decimalsIn),
        evmChainId: this.botConfig.evmChainId,
      });
      return true;
    }

    this.logger.info('Executing arbitrage opportunity', {
      tokenA: opportunity.tokenA,
      tokenB: opportunity.tokenB,
      dex1: opportunity.dex1,
      dex2: opportunity.dex2,
      profit: ethers.formatUnits(opportunity.profit, opportunity.decimalsOut),
      netProfit: ethers.formatUnits(opportunity.netProfit, opportunity.decimalsIn)
    });

    if (!this.executionService) {
      console.error(
        `[EXECUTE_ERROR] execution service unavailable route=${opportunity.route}`
      );
      this.logger.error('Execution service unavailable: wallet not initialized for live execution mode');
      return false;
    }

    try {
      console.log(
        `[EXECUTE_ATTEMPT] ts=${new Date().toISOString()} route=${opportunity.route} tokenA=${opportunity.tokenA} tokenB=${opportunity.tokenB} netProfit=${ethers.formatUnits(opportunity.netProfit, opportunity.decimalsIn)}`
      );
      const execOverrides: ExecutionOverrides = {
        slippagePct: rs?.slippagePct,
        requiredConfirmations: rs?.requiredConfirmations,
      };
      const result = await this.executionService.executeArbitrage(opportunity, execOverrides);
      
      if (result.success) {
        this.stats.successfulTrades++;
        this.stats.totalProfit = (BigInt(this.stats.totalProfit) + BigInt(result.profit)).toString();
        this.stats.totalGasUsed = (BigInt(this.stats.totalGasUsed) + BigInt(result.gasUsed)).toString();
        this.stats.lastTradeTime = Date.now();
        
        this.logger.info('Arbitrage executed successfully', {
          hash: result.hash,
          profit: ethers.formatUnits(result.profit, opportunity.decimalsOut),
          gasUsed: result.gasUsed
        });
        console.log(
          `[EXECUTE_OK] hash=${result.hash} gasUsed=${result.gasUsed} profit=${ethers.formatUnits(result.profit, opportunity.decimalsOut)} ${opportunity.tokenB}`
        );
        this.alertService.tradeExecuted({
          pair: `${opportunity.tokenA}/${opportunity.tokenB}`,
          route: opportunity.route,
          netProfit: ethers.formatUnits(opportunity.netProfit, opportunity.decimalsIn),
          hash: result.hash,
          gasUsed: result.gasUsed,
        }).catch(() => {});
        this.updateCanaryPnl(result);
        this.updateStats();
        return true;
      } else {
        this.stats.failedTrades++;
        this.logger.error('Arbitrage execution failed', {
          error: result.error,
          gasUsed: result.gasUsed
        });
        console.error(
          `[EXECUTE_FAIL] error=${result.error || 'unknown'} gasUsed=${result.gasUsed}`
        );
        this.alertService.tradeFailed({
          pair: `${opportunity.tokenA}/${opportunity.tokenB}`,
          route: opportunity.route,
          error: result.error || 'unknown',
        }).catch(() => {});
        this.updateCanaryPnl(result);
        this.updateStats();
        return false;
      }
    } catch (error) {
      this.stats.failedTrades++;
      this.logger.error('Error executing arbitrage', { 
        error: error instanceof Error ? error.message : error 
      });
      console.error(
        `[EXECUTE_THROW] error=${error instanceof Error ? error.message : String(error)}`
      );
      this.updateStats();
      return false;
    }
  }

  private resetCanaryDayIfNeeded(): void {
    const currentDay = new Date().toISOString().slice(0, 10);
    if (currentDay !== this.canaryDay) {
      this.canaryDay = currentDay;
      this.canaryDailyPnlEth = 0;
      this.logger.info('🧪 Canary day rollover: reset daily PnL tracker');
    }
  }

  private updateCanaryPnl(result: { success: boolean; profit: string; gasUsed: string; gasPrice: string }): void {
    if (!this.botConfig.canaryEnabled) {
      return;
    }

    this.resetCanaryDayIfNeeded();

    const profitWei = BigInt(result.profit || '0');
    const gasUsed = BigInt(result.gasUsed || '0');
    const gasPrice = BigInt(result.gasPrice || '0');
    const gasCostWei = gasUsed * gasPrice;

    const netWei = result.success ? profitWei - gasCostWei : -gasCostWei;
    const netEth = parseFloat(ethers.formatEther(netWei));

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
      this.alertService.botStopped(
        `Canary daily loss cap breached: ${this.canaryDailyPnlEth.toFixed(6)} ETH (max ${this.botConfig.canaryMaxDailyLossEth} ETH)`
      ).catch(() => {});
      this.stop();
    }
  }

  /**
   * Estimate gas costs for arbitrage execution
   */
  private estimateGasCost(): { totalCost: string } {
    const gasLimit = 300000; // Conservative estimate
    const gasPrice = this.cachedGasPriceWei;
    const totalCost = gasLimit * gasPrice;

    return {
      totalCost: totalCost.toString()
    };
  }

  /**
   * Get current gas price in wei (cached, refreshed from provider)
   */
  private getCurrentGasPrice(): number {
    return this.cachedGasPriceWei;
  }

  /**
   * Refresh gas price from provider (call periodically, e.g. each scan tick)
   */
  private async refreshGasPrice(): Promise<void> {
    const now = Date.now();
    if (now - this.lastGasPriceRefreshMs < 15_000) return; // refresh at most every 15s
    try {
      const feeData = await this.provider.getFeeData();
      const price = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (price && price > 0n) {
        this.cachedGasPriceWei = Number(price);
        this.lastGasPriceRefreshMs = now;
      }
    } catch {
      // keep cached value on failure
    }
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
      } else {
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
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
