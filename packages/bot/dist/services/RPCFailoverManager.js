"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRPCFailoverManager = exports.RPCFailoverManager = void 0;
const ethers_1 = require("ethers");
const Logger_1 = require("../utils/Logger");
const logger = new Logger_1.Logger('RPCFailover');
/**
 * RPC Failover Strategy
 * Maintains a chain of fallback RPCs with health checks and automatic switching
 */
class RPCFailoverManager {
    providers = [];
    currentIndex = 0;
    healthCheckInterval = null;
    constructor() {
        this.initializeProviders();
    }
    /**
     * Initialize providers from environment (primary + fallbacks)
     */
    initializeProviders() {
        const rpcUrls = [
            process.env['ETHEREUM_RPC_URL'],
            process.env['ETHEREUM_RPC_FALLBACK_1'],
            process.env['ETHEREUM_RPC_FALLBACK_2'],
            process.env['PRIVATE_RELAY_URL'],
        ].filter((url) => !!url);
        if (rpcUrls.length === 0) {
            throw new Error('No RPC URLs configured');
        }
        this.providers = rpcUrls.map((url) => ({
            url,
            provider: new ethers_1.ethers.JsonRpcProvider(url),
            healthy: true,
        }));
        logger.info('RPC Failover Manager initialized', { count: this.providers.length, urls: rpcUrls });
    }
    /**
     * Get current healthy provider
     */
    getProvider() {
        if (this.providers.length === 0) {
            throw new Error('No providers available');
        }
        // Rotate through healthy providers
        let attempts = 0;
        while (attempts < this.providers.length) {
            const provider = this.providers[this.currentIndex];
            if (provider && provider.healthy) {
                return provider.provider;
            }
            this.currentIndex = (this.currentIndex + 1) % this.providers.length;
            attempts++;
        }
        // Fallback to first provider if all marked unhealthy
        logger.warn('All providers marked unhealthy, using primary');
        const primaryProvider = this.providers[0];
        if (!primaryProvider)
            throw new Error('No providers available');
        return primaryProvider.provider;
    }
    /**
     * Get provider URL for logging
     */
    getCurrentRpcUrl() {
        const provider = this.providers[this.currentIndex];
        if (!provider)
            throw new Error('Current provider not found');
        return provider.url;
    }
    /**
     * Start periodic health checks
     */
    startHealthChecks(intervalMs = 30000) {
        this.healthCheckInterval = setInterval(async () => {
            await this.checkHealth();
        }, intervalMs);
        logger.info('RPC health checks started', { intervalMs });
    }
    /**
     * Stop health checks
     */
    stopHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.info('RPC health checks stopped');
        }
    }
    /**
     * Check health of all providers
     */
    async checkHealth() {
        const checks = this.providers.map(async (provider, index) => {
            try {
                const blockNumber = await provider.provider.getBlockNumber();
                const now = Math.floor(Date.now() / 1000);
                const block = await provider.provider.getBlock(blockNumber);
                if (!block) {
                    provider.healthy = false;
                    return;
                }
                // Block is too old (more than 30 minutes)
                if (now - (block.timestamp || 0) > 1800) {
                    provider.healthy = false;
                    logger.warn('RPC provider stale', { index, url: provider.url, blockAge: now - block.timestamp });
                    return;
                }
                provider.healthy = true;
            }
            catch (error) {
                provider.healthy = false;
                logger.warn('RPC provider health check failed', { index, url: provider.url, error });
            }
        });
        await Promise.all(checks);
        const healthyCount = this.providers.filter((p) => p.healthy).length;
        logger.debug('RPC health check complete', { healthy: healthyCount, total: this.providers.length });
    }
    /**
     * Report provider error and try to switch
     */
    reportError(error) {
        const currentProvider = this.providers[this.currentIndex];
        logger.error('RPC call failed', { error: error.message, url: currentProvider?.url || 'unknown' });
        // Mark current as unhealthy and rotate
        if (currentProvider) {
            currentProvider.healthy = false;
        }
        this.currentIndex = (this.currentIndex + 1) % this.providers.length;
        logger.info('Switched to fallback RPC', { url: this.getCurrentRpcUrl() });
    }
    /**
     * Get provider status for monitoring
     */
    getStatus() {
        const currentProvider = this.providers[this.currentIndex];
        return {
            current: {
                url: currentProvider?.url || 'unknown',
                healthy: currentProvider?.healthy || false,
            },
            providers: this.providers.map((p, i) => ({
                index: i,
                url: p.url,
                healthy: p.healthy,
            })),
            healthy_count: this.providers.filter((p) => p.healthy).length,
            total_count: this.providers.length,
        };
    }
    /**
     * Shutdown
     */
    shutdown() {
        this.stopHealthChecks();
        logger.info('RPC Failover Manager shutdown');
    }
}
exports.RPCFailoverManager = RPCFailoverManager;
/**
 * Singleton instance
 */
let rpcManager = null;
function getRPCFailoverManager() {
    if (!rpcManager) {
        rpcManager = new RPCFailoverManager();
    }
    return rpcManager;
}
exports.getRPCFailoverManager = getRPCFailoverManager;
