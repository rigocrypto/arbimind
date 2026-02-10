import { ArbitrageBot } from './services/ArbitrageBot';
import { validateConfig } from './config';
import { Logger } from './utils/Logger';
import { SolanaScanner } from './solana/Scanner';

const logger = new Logger('Main');

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting ArbiMind Arbitrage Bot...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');

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
