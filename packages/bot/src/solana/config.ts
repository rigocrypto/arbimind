/**
 * Solana Bot Configuration
 * Pools, scanners, and AI scoring for Raydium/Pump.fun DEX
 */

export interface SolanaConfig {
  watchedPools: string[];
  pumpFunProgram: string;
  scanIntervalSec: number;
  isTestnet: boolean;
}

export const solanaConfig: SolanaConfig = {
  watchedPools: (process.env.SOLANA_WATCHED_POOLS || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0),
  pumpFunProgram: process.env.SOLANA_PUMP_FUN_PROGRAM || '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  scanIntervalSec: parseInt(process.env.SOLANA_SCAN_INTERVAL_SEC || '10', 10),
  isTestnet: process.env.NETWORK === 'testnet',
};
