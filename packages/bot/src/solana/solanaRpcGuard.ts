import { Connection } from '@solana/web3.js';
import type { SolanaExecutorConfig } from './Executor';

const HEALTH_TIMEOUT_MS = 5000;

export interface RpcGuardResult {
  config: SolanaExecutorConfig;
  healthy: boolean;
  forced: boolean;
  slotAtCheck?: number;
  errorMsg?: string;
}

export async function checkSolanaRpcHealth(
  config: SolanaExecutorConfig
): Promise<RpcGuardResult> {
  if (!config.rpcUrl) {
    const msg = 'SOLANA_RPC_URL is not set';
    logRpcError(msg, config);
    return forceLogOnly(config, msg);
  }

  const connection = new Connection(config.rpcUrl, { commitment: 'confirmed' });

  let slot: number;
  try {
    const slotPromise = connection.getSlot();
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`RPC health timeout after ${HEALTH_TIMEOUT_MS}ms`)), HEALTH_TIMEOUT_MS);
    });
    slot = await Promise.race([slotPromise, timeout]);
  } catch (error) {
    const msg = `RPC health check failed: ${error instanceof Error ? error.message : String(error)}`;
    logRpcError(msg, config);
    return forceLogOnly(config, msg);
  }

  if (slot <= 0) {
    const msg = `RPC returned invalid slot: ${slot}`;
    logRpcError(msg, config);
    return forceLogOnly(config, msg);
  }

  console.log('[SOLANA] RPC health check passed', {
    rpc: redactUrl(config.rpcUrl),
    slot,
    tradingEnabled: config.tradingEnabled,
    logOnly: config.logOnly,
    canaryMode: config.canaryMode,
  });

  return { config, healthy: true, forced: false, slotAtCheck: slot };
}

function forceLogOnly(config: SolanaExecutorConfig, errorMsg: string): RpcGuardResult {
  const wasLive = config.tradingEnabled && !config.logOnly;

  const hardened: SolanaExecutorConfig = {
    ...config,
    logOnly: true,
  };

  if (wasLive) {
    console.error('[SOLANA] RPC unhealthy at startup - trading enabled (RISK)', {
      rpc: redactUrl(config.rpcUrl),
      tradingEnabled: config.tradingEnabled,
      canaryMode: config.canaryMode,
      errorMsg,
      action: 'logOnly overridden to true - deploy will not send transactions',
    });
  } else {
    console.warn('[SOLANA] RPC unhealthy at startup (trading already disabled or log-only)', {
      rpc: redactUrl(config.rpcUrl),
      errorMsg,
    });
  }

  return { config: hardened, healthy: false, forced: wasLive, errorMsg };
}

function logRpcError(msg: string, config: SolanaExecutorConfig): void {
  if (config.tradingEnabled) {
    console.error(`[SOLANA] RPC ERROR: ${msg}`);
  } else {
    console.warn(`[SOLANA] RPC WARN: ${msg}`);
  }
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('api-key')) {
      parsed.searchParams.set('api-key', '***');
    }
    return parsed.toString();
  } catch {
    return url.replace(/api[-_]?key=[^&]+/gi, 'api-key=***');
  }
}
