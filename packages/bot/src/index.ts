
console.log('DEBUG: index.ts entrypoint reached');
import { loadEnv } from './bootstrapEnv';
// Load environment variables FIRST, before importing anything else
loadEnv();
console.log('DEBUG: .env loaded');

import { ethers } from 'ethers';
import { ArbitrageBot } from './services/ArbitrageBot';
import { validateConfig, refreshConfig, config } from './config';
import { getIdentitySource, shortAddress } from './config/identity';
import { Logger } from './utils/Logger';
import { SolanaScanner } from './solana/Scanner';

const logger = new Logger('Main');

function isValidPrivateKey(value: string): boolean {
  return value.length === 66 && value.startsWith('0x');
}

async function main(): Promise<void> {
  try {
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
    logger.error('❌ Failed to start bot', {
      error: error instanceof Error ? error.message : error
    });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    promise: promise
  });
  process.exit(1);
});

// Start the application
main().catch((error) => {
  logger.error('💥 Main function failed', {
    error: error instanceof Error ? error.message : error
  });
  process.exit(1);
});
