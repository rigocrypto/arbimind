import { config } from '../config';
import { inventoryConfig, solanaExecutorConfig, solanaSignerSource, type SolanaSignerSource } from '../solana/config';

/**
 * Execution-safety flags exactly as THIS process resolved them.
 *
 * Deployment configuration at rest is not proof of what a running process
 * loaded; this line is. It carries booleans and a signer source category
 * only -- never key material, RPC URLs, addresses or credentials.
 */
export interface ExecutionSafetyBoot {
  botLogOnly: boolean;
  solanaLogOnly: boolean;
  sanityTxEnabled: boolean;
  autoFundEnabled: boolean;
  autoRebalanceEnabled: boolean;
  solanaSignerConfigured: boolean;
  solanaSignerSource: SolanaSignerSource;
}

export function collectExecutionSafetyBoot(): ExecutionSafetyBoot {
  const signerConfigured = solanaExecutorConfig.privateKeyBase58.trim().length > 0;
  return {
    botLogOnly: config.logOnly,
    solanaLogOnly: solanaExecutorConfig.logOnly,
    sanityTxEnabled: config.sanityTxEnabled,
    autoFundEnabled: inventoryConfig.autoFundEnabled,
    autoRebalanceEnabled: inventoryConfig.autoRebalanceEnabled,
    solanaSignerConfigured: signerConfigured,
    solanaSignerSource: signerConfigured ? solanaSignerSource : 'none',
  };
}

export function logExecutionSafetyBoot(
  write: (line: string) => void = (line) => console.error(line),
): ExecutionSafetyBoot {
  const boot = collectExecutionSafetyBoot();
  write(`[EXECUTION_SAFETY_BOOT] ${JSON.stringify(boot)}`);
  return boot;
}
