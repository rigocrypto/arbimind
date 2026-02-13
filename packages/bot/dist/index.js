"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bootstrapEnv_1 = require("./bootstrapEnv");
// Load environment variables FIRST, before importing anything else
(0, bootstrapEnv_1.loadEnv)();
const ArbitrageBot_1 = require("./services/ArbitrageBot");
const config_1 = require("./config");
const Logger_1 = require("./utils/Logger");
const Scanner_1 = require("./solana/Scanner");
const logger = new Logger_1.Logger('Main');
async function main() {
    try {
        // Refresh config with loaded env vars
        (0, config_1.refreshConfig)();
        logger.info('🚀 Starting ArbiMind Arbitrage Bot...');
        // Validate configuration
        (0, config_1.validateConfig)();
        logger.info('✅ Configuration validated');
        // Log selected chain
        logger.info(`📡 Selected chain: ${config_1.config.evmChain} (chainId=${config_1.config.evmChainId})`);
        logger.info(`🌐 RPC: ${config_1.config.ethereumRpcUrl.split('/').slice(0, 3).join('/')}/...`);
        if (config_1.config.logOnly) {
            logger.info('📊 Running in LOG_ONLY mode (no trades will be executed)');
        }
        // Create and start the arbitrage bot
        const bot = new ArbitrageBot_1.ArbitrageBot();
        // Create and start the Solana scanner
        const solanaScanner = new Scanner_1.SolanaScanner();
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
    }
    catch (error) {
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
