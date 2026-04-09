/**
 * Solana Bot Configuration
 * Pools, scanners, and AI scoring for Raydium/Pump.fun DEX
 */

export interface SolanaConfig {
  enabled: boolean;
  watchedPools: string[];
  pumpFunProgram: string;
  scanIntervalSec: number;
  isTestnet: boolean;
}

export interface SolanaExecutorRuntimeConfig {
  tradingEnabled: boolean;
  logOnly: boolean;
  canaryMode: boolean;
  maxNotionalUsd: number;
  minExpectedProfitUsd: number;
  maxDailyLossUsd: number;
  maxSlippageBps: number;
  rpcUrl: string;
  privateKeyBase58: string;
  jupiterBaseUrl: string;
}

function isEnvTrue(value: string | undefined): boolean {
  const v = (value || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function isEnvFalse(value: string | undefined): boolean {
  const v = (value || '').trim().toLowerCase();
  return v === 'false' || v === '0' || v === 'no' || v === 'off';
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const solanaConfig: SolanaConfig = {
  enabled: isEnvTrue(process.env['SOLANA_SCANNER_ENABLED']),
  watchedPools: (process.env['SOLANA_WATCHED_POOLS'] || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0),
  pumpFunProgram: process.env['SOLANA_PUMP_FUN_PROGRAM'] || '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  scanIntervalSec: parseInt(process.env['SOLANA_SCAN_INTERVAL_SEC'] || '10', 10),
  isTestnet: process.env['NETWORK'] === 'testnet',
};

export const solanaExecutorConfig: SolanaExecutorRuntimeConfig = {
  tradingEnabled: isEnvTrue(process.env['SOLANA_TRADING_ENABLED']),
  logOnly: !isEnvFalse(process.env['SOLANA_LOG_ONLY']),
  canaryMode: !isEnvFalse(process.env['SOLANA_CANARY_MODE']),
  maxNotionalUsd: parseNumber(process.env['SOLANA_MAX_NOTIONAL_USD'], 5),
  minExpectedProfitUsd: parseNumber(process.env['SOLANA_MIN_EXPECTED_PROFIT_USD'], 0.1),
  maxDailyLossUsd: parseNumber(process.env['SOLANA_MAX_DAILY_LOSS_USD'], 25),
  maxSlippageBps: parseNumber(process.env['SOLANA_MAX_SLIPPAGE_BPS'], 50),
  rpcUrl:
    process.env['SOLANA_RPC_URL_MAINNET_BETA'] ||
    process.env['SOLANA_RPC_URL'] ||
    '',
  privateKeyBase58:
    process.env['SOLANA_PRIVATE_KEY_BASE58'] ||
    process.env['SOLANA_TREASURY_SECRET_KEY'] ||
    '',
  jupiterBaseUrl: process.env['JUPITER_BASE_URL'] || 'https://quote-api.jup.ag/v6',
};
