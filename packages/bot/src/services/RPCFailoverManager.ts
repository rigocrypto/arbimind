import { ethers } from 'ethers';
import { Logger } from '../utils/Logger';

const logger = new Logger('RPCFailover');

/**
 * RPC Failover Strategy
 * Maintains a chain of fallback RPCs with health checks and automatic switching
 */
export class RPCFailoverManager {
  private providers: Array<{ url: string; provider: ethers.JsonRpcProvider; healthy: boolean }> = [];
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeProviders();
  }

  /**
   * Initialize providers from environment (primary + fallbacks)
   */
  private initializeProviders(): void {
    const rpcUrls = [
      process.env['ETHEREUM_RPC_URL'],
      process.env['ETHEREUM_RPC_FALLBACK_1'],
      process.env['ETHEREUM_RPC_FALLBACK_2'],
      process.env['PRIVATE_RELAY_URL'],
    ].filter((url): url is string => !!url);

    if (rpcUrls.length === 0) {
      throw new Error('No RPC URLs configured');
    }

    this.providers = rpcUrls.map((url) => ({
      url,
      provider: new ethers.JsonRpcProvider(url),
      healthy: true,
    }));

    logger.info('RPC Failover Manager initialized', { count: this.providers.length, urls: rpcUrls });
  }

  /**
   * Get current healthy provider
   */
  public getProvider(): ethers.JsonRpcProvider {
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
    if (!primaryProvider) throw new Error('No providers available');
    return primaryProvider.provider;
  }

  /**
   * Get provider URL for logging
   */
  public getCurrentRpcUrl(): string {
    const provider = this.providers[this.currentIndex];
    if (!provider) throw new Error('Current provider not found');
    return provider.url;
  }

  /**
   * Start periodic health checks
   */
  public startHealthChecks(intervalMs: number = 30000): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkHealth();
    }, intervalMs);

    logger.info('RPC health checks started', { intervalMs });
  }

  /**
   * Stop health checks
   */
  public stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('RPC health checks stopped');
    }
  }

  /**
   * Check health of all providers
   */
  private async checkHealth(): Promise<void> {
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
      } catch (error) {
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
  public reportError(error: Error): void {
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
  public getStatus(): Record<string, unknown> {
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
  public shutdown(): void {
    this.stopHealthChecks();
    logger.info('RPC Failover Manager shutdown');
  }
}

/**
 * Singleton instance
 */
let rpcManager: RPCFailoverManager | null = null;

export function getRPCFailoverManager(): RPCFailoverManager {
  if (!rpcManager) {
    rpcManager = new RPCFailoverManager();
  }
  return rpcManager;
}
