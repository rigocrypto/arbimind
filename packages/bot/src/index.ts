import { loadEnv } from './bootstrapEnv';
const bootTs = new Date().toISOString();
console.log(`[BOOT] arbimind-bot entrypoint loaded @ ${bootTs} node=${process.version} pid=${process.pid}`);

try {
  loadEnv();
  console.log(`[BOOT] env bootstrap completed @ ${new Date().toISOString()}`);
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[BOOT] env bootstrap failed @ ${new Date().toISOString()} error=${message}`);
}

const heartbeatSecRaw = process.env['BOT_HEARTBEAT_LOG_SEC'] || '30';
const heartbeatSec = Number.parseInt(heartbeatSecRaw, 10);
if (Number.isFinite(heartbeatSec) && heartbeatSec > 0) {
  const heartbeatTimer = setInterval(() => {
    console.log(`[HEARTBEAT] arbimind-bot alive @ ${new Date().toISOString()} pid=${process.pid}`);
  }, heartbeatSec * 1000);
  heartbeatTimer.unref();
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
    const [{ ethers }, configModule, identityModule, loggerModule, botModule, solanaModule] = await Promise.all([
      import('ethers'),
      import('./config/index.js'),
      import('./config/identity.js'),
      import('./utils/Logger.js'),
      import('./services/ArbitrageBot.js'),
      import('./solana/Scanner.js'),
    ]);

    const { refreshConfig, validateConfig, config } = configModule;
    const { getIdentitySource, shortAddress } = identityModule;
    const { Logger } = loggerModule;
    const { ArbitrageBot } = botModule;
    const { SolanaScanner } = solanaModule;

    const logger = new Logger('Main');

    // Refresh config with loaded env vars
    refreshConfig();
    
    logger.info('🚀 Starting ArbiMind Arbitrage Bot...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');

    console.log(
      `[MODE] network=${config.network} allowTestnetTrades=${config.allowTestnetTrades} logOnly=${config.logOnly}`
    );
    console.log(
      `[CHAIN] evmChain=${config.evmChain} chainId=${config.evmChainId} rpc=${config.ethereumRpcUrl}`
    );
    console.log(
      `[SANITY_MODE] enabled=${config.sanityTxEnabled} intervalSec=${config.sanityTxIntervalSec} valueWei=${config.sanityTxWei} to=${config.sanityTxTo || '(self)'}`
    );
    
    // Log selected chain
    logger.info(`📡 Selected chain: ${config.evmChain} (chainId=${config.evmChainId})`);
    logger.info(`🌐 RPC: ${config.ethereumRpcUrl.split('/').slice(0, 3).join('/')}/...`);
    if (config.logOnly) {
      logger.info('📊 Running in LOG_ONLY mode (no trades will be executed)');
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

    // Create and start the arbitrage bot
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

    // Start the bot
    await bot.start();

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
  console.log(`[EXIT] arbimind-bot exiting with code=${code} @ ${new Date().toISOString()}`);
});

// Start the application
console.log(`[BOOT] invoking main() @ ${new Date().toISOString()}`);
main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[FATAL] main() rejected @ ${new Date().toISOString()} error=${message}`);
  process.exit(1);
});
