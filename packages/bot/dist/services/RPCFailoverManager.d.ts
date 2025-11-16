import { ethers } from 'ethers';
/**
 * RPC Failover Strategy
 * Maintains a chain of fallback RPCs with health checks and automatic switching
 */
export declare class RPCFailoverManager {
    private providers;
    private currentIndex;
    private healthCheckInterval;
    constructor();
    /**
     * Initialize providers from environment (primary + fallbacks)
     */
    private initializeProviders;
    /**
     * Get current healthy provider
     */
    getProvider(): ethers.JsonRpcProvider;
    /**
     * Get provider URL for logging
     */
    getCurrentRpcUrl(): string;
    /**
     * Start periodic health checks
     */
    startHealthChecks(intervalMs?: number): void;
    /**
     * Stop health checks
     */
    stopHealthChecks(): void;
    /**
     * Check health of all providers
     */
    private checkHealth;
    /**
     * Report provider error and try to switch
     */
    reportError(error: Error): void;
    /**
     * Get provider status for monitoring
     */
    getStatus(): Record<string, unknown>;
    /**
     * Shutdown
     */
    shutdown(): void;
}
export declare function getRPCFailoverManager(): RPCFailoverManager;
//# sourceMappingURL=RPCFailoverManager.d.ts.map