import { loadEnv } from './bootstrapEnv';

console.error(`[BOOT] ArbiMind bot process start pid=${process.pid} node=${process.version} ts=${new Date().toISOString()}`);

try {
  loadEnv();
  console.error(`[BOOT] env bootstrap completed ts=${new Date().toISOString()}`);
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`env bootstrap failed: ${message}`);
}

function isValidPrivateKey(value: string): boolean {
  return value.length === 66 && value.startsWith('0x');
}

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isEnvTrue(value: string | undefined): boolean {
  const normalized = normalizeEnvValue(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function isEnvFalse(value: string | undefined): boolean {
  const normalized = normalizeEnvValue(value).toLowerCase();
  return normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off';
}

function shouldGracefulExitFromEnv(): boolean {
  if (isEnvTrue(process.env['LOG_ONLY']) || isEnvTrue(process.env['BOT_LOG_ONLY'])) {
    return true;
  }
  const isTestnet = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase() === 'testnet';
  const allowTestnetTrades = isEnvTrue(process.env['ALLOW_TESTNET_TRADES']);
  return isTestnet && !allowTestnetTrades;
}

async function main(): Promise<void> {
  try {
    console.error('[BOOT] importing ethers');
    const { ethers } = await import('ethers');
    console.error('[BOOT] imported ethers');

    console.error('[BOOT] importing config/index');
    const configModule = await import('./config/index.js');
    console.error('[BOOT] imported config/index');

    console.error('[BOOT] importing config/identity');
    const identityModule = await import('./config/identity.js');
    console.error('[BOOT] imported config/identity');

    console.error('[BOOT] importing utils/Logger');
    const loggerModule = await import('./utils/Logger.js');
    console.error('[BOOT] imported utils/Logger');

    console.error('[BOOT] importing services/ArbitrageBot');
    const botModule = await import('./services/ArbitrageBot.js');
    console.error('[BOOT] imported services/ArbitrageBot');

    console.error('[BOOT] importing solana/Scanner');
    const solanaModule = await import('./solana/Scanner.js');
    console.error('[BOOT] imported solana/Scanner');

    console.error('[BOOT] importing solana/config');
    const solanaConfigModule = await import('./solana/config.js');
    console.error('[BOOT] imported solana/config');

    console.error('[BOOT] importing solana/solanaRpcGuard');
    const solanaRpcGuardModule = await import('./solana/solanaRpcGuard.js');
    console.error('[BOOT] imported solana/solanaRpcGuard');

    const { refreshConfig, validateConfig, config } = configModule;
    const { getIdentitySource, shortAddress } = identityModule;
    const { Logger } = loggerModule;
    const { ArbitrageBot } = botModule;
    const { SolanaScanner } = solanaModule;
    const { solanaExecutorConfig } = solanaConfigModule;
    const { checkSolanaRpcHealth } = solanaRpcGuardModule;

    const logger = new Logger('Main');

    // Refresh config with loaded env vars
    refreshConfig();
    
    logger.info('🚀 Starting ArbiMind Arbitrage Bot...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');

    // Log selected chain
    logger.info(`📡 Selected chain: ${config.evmChain} (chainId=${config.evmChainId})`);
    logger.info(`🌐 RPC: ${config.ethereumRpcUrl.split('/').slice(0, 3).join('/')}/...`);
    if (config.logOnly) {
      logger.info('📊 Running in LOG_ONLY mode (no trades will be executed)');
    }

    const evmScannerEnabled = !isEnvFalse(process.env['EVM_SCANNER_ENABLED']);
    if (!evmScannerEnabled) {
      logger.warn('⏸️ EVM scanner disabled by EVM_SCANNER_ENABLED=false; Solana scanner remains active');
    }

    const privateKey = config.privateKey?.trim() || '';
    const walletAddressEnv = config.walletAddress?.trim() || '';
    const hasPrivateKey = isValidPrivateKey(privateKey);
    const identitySource = getIdentitySource({
      hasWallet: hasPrivateKey,
      walletAddress: walletAddressEnv,
    });
    const effectiveAddress = hasPrivateKey
      ? new ethers.Wallet(privateKey).address
      : walletAddressEnv;

    logger.info(
      `🔐 Identity: ${identitySource}${effectiveAddress ? ` (${shortAddress(effectiveAddress)})` : ''} | mode=${config.logOnly ? 'LOG_ONLY' : 'LIVE'}`
    );

    if (config.canaryEnabled) {
      logger.warn('🧪 Running in CANARY mode', {
        canaryNotionalEth: config.canaryNotionalEth,
        canaryMaxDailyLossEth: config.canaryMaxDailyLossEth
      });
    }

    const effectiveSolanaNotionalUsd = solanaExecutorConfig.canaryMode
      ? Math.min(solanaExecutorConfig.maxNotionalUsd, 5)
      : solanaExecutorConfig.maxNotionalUsd;
    logger.info('🧮 Solana notional gate', {
      configuredMaxNotionalUsd: solanaExecutorConfig.maxNotionalUsd,
      effectiveMaxNotionalUsd: effectiveSolanaNotionalUsd,
      canaryMode: solanaExecutorConfig.canaryMode,
    });

    const solanaRpcGuard = await checkSolanaRpcHealth(solanaExecutorConfig);
    Object.assign(solanaExecutorConfig, solanaRpcGuard.config);
    if (solanaRpcGuard.forced) {
      logger.error('⚠️ Solana trading was enabled but RPC is unhealthy; forcing LOG_ONLY mode');
    }

    // Structured boot summary for observability
    console.log('[BOOT_SUMMARY]', JSON.stringify({
      ts: new Date().toISOString(),
      network: config.network,
      evmChain: config.evmChain,
      chainId: config.evmChainId,
      evmScannerEnabled,
      mode: config.logOnly ? 'LOG_ONLY' : 'LIVE',
      canary: config.canaryEnabled,
      v3Enabled: !isEnvTrue(process.env['ENABLE_V3_QUOTES'] === 'false' ? 'false' : undefined),
      scanIntervalMs: config.scanIntervalMs,
      minProfitEth: config.minProfitEth,
      minProfitUsd: config.minProfitUsd,
      maxGasPriceGwei: config.maxGasPriceGwei,
      maxSlippageBps: config.maxSlippageBps,
      minEdgeBps: config.minEdgeBps,
      swapAmountEth: config.swapAmountEth,
      solanaEnabled: Boolean(process.env['SOLANA_SCANNER_ENABLED'] === 'true'),
      solanaTradingEnabled: solanaExecutorConfig.tradingEnabled,
      solanaLogOnly: solanaExecutorConfig.logOnly,
      solanaCanaryMode: solanaExecutorConfig.canaryMode,
      solanaConfiguredMaxNotionalUsd: solanaExecutorConfig.maxNotionalUsd,
      solanaEffectiveMaxNotionalUsd: effectiveSolanaNotionalUsd,
      solanaRpcHealthyAtBoot: solanaRpcGuard.healthy,
      solanaRpcGuardForcedLogOnly: solanaRpcGuard.forced,
      solanaRpcSlotAtCheck: solanaRpcGuard.slotAtCheck,
    }));

    // Create the arbitrage bot (EVM scanner can be disabled via env)
    const bot = new ArbitrageBot();
    
    // Create and start the Solana scanner
    const solanaScanner = new SolanaScanner();
    solanaScanner.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('🛑 Received SIGINT, shutting down gracefully...');
      bot.stop();
      solanaScanner.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('🛑 Received SIGTERM, shutting down gracefully...');
      bot.stop();
      solanaScanner.stop();
      process.exit(0);
    });

    // Start scanners based on runtime toggles
    if (evmScannerEnabled) {
      await bot.start();
    } else {
      logger.info('EVM scanner start skipped (EVM_SCANNER_ENABLED=false); process kept alive by Solana scanner loop');
      await new Promise<void>(() => {
        // Intentionally never resolves while process is running.
      });
    }

  } catch (error) {
    const shouldGracefulExit = shouldGracefulExitFromEnv();
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(`[FATAL] bot startup error @ ${new Date().toISOString()} error=${message}`);

    if (shouldGracefulExit) {
      console.warn('⚠️ Startup failed in LOG_ONLY mode. Exiting gracefully to avoid restart loop.');
      process.exit(0);
    }

    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    promise: promise
  });
  process.exit(1);
});

process.on('exit', (code) => {
  if (code !== 0) {
    console.error(`arbimind-bot exiting with non-zero code=${code}`);
  }
});

// Start the application
main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[FATAL] main() rejected @ ${new Date().toISOString()} error=${message}`);
  process.exit(1);
});
