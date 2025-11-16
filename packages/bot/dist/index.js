"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ArbitrageBot_1 = require("./services/ArbitrageBot");
const config_1 = require("./config");
const Logger_1 = require("./utils/Logger");
const logger = new Logger_1.Logger('Main');
async function main() {
    try {
        logger.info('🚀 Starting ArbiMind Arbitrage Bot...');
        // Validate configuration
        (0, config_1.validateConfig)();
        logger.info('✅ Configuration validated');
        // Create and start the bot
        const bot = new ArbitrageBot_1.ArbitrageBot();
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            logger.info('🛑 Received SIGINT, shutting down gracefully...');
            bot.stop();
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            logger.info('🛑 Received SIGTERM, shutting down gracefully...');
            bot.stop();
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
//# sourceMappingURL=index.js.map