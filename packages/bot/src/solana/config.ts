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
  onlyDirectRoutes: boolean;
  computeUnitLimit: number;
  priorityFeeMicroLamports: number;
  maxPriceImpactPct: number;
  ammDenylist: string[];
  ammAllowlist: string[];
  templateDenylist: string[];
  raydiumFingerprintDenylist: string[];
  asLegacyTransaction: boolean;
  tradeSizeMode: 'fixed' | 'dynamic';
  minSpreadBps: number;
  allocationPct: number;
  minTradeSizeUsd: number;
  maxTradeSizeUsd: number;
  drawdownTriggerPct: number;
  drawdownScale: number;
  maxNotionalUsd: number;
  minExpectedProfitUsd: number;
  maxDailyLossUsd: number;
  maxSlippageBps: number;
  quoteMaxAgeMs: number;
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

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseFraction(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : fallback;
}

function parseMode(value: string | undefined): 'fixed' | 'dynamic' {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'dynamic' ? 'dynamic' : 'fixed';
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
  onlyDirectRoutes: !isEnvFalse(process.env['SOLANA_ONLY_DIRECT_ROUTES'] || 'true'),
  computeUnitLimit: Number(process.env['SOLANA_COMPUTE_UNIT_LIMIT'] ?? 300_000),
  priorityFeeMicroLamports: Number(process.env['SOLANA_PRIORITY_FEE_MICROLAMPORTS'] ?? 5_000),
  maxPriceImpactPct: Number(process.env['SOLANA_MAX_PRICE_IMPACT_PCT'] ?? 0.3),
  ammDenylist: (process.env['SOLANA_AMM_DENYLIST'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  ammAllowlist: (process.env['SOLANA_AMM_ALLOWLIST'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  templateDenylist: (process.env['SOLANA_TEMPLATE_DENYLIST'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  raydiumFingerprintDenylist: (process.env['SOLANA_RAYDIUM_FP_DENYLIST'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  asLegacyTransaction: !isEnvFalse(process.env['SOLANA_LEGACY_TX'] ?? 'true'),
  tradeSizeMode: parseMode(process.env['SOLANA_TRADE_SIZE_MODE'] || process.env['TRADE_SIZE_MODE']),
  minSpreadBps: parseNonNegativeNumber(process.env['SOLANA_MIN_SPREAD_BPS'], 0),
  allocationPct: parseFraction(process.env['SOLANA_ALLOCATION_PCT'] || process.env['ALLOCATION_PCT'], 0.25),
  minTradeSizeUsd: parseNumber(process.env['SOLANA_MIN_TRADE_SIZE_USD'] || process.env['MIN_TRADE_SIZE_USD'], 0),
  maxTradeSizeUsd: parseNumber(process.env['SOLANA_MAX_TRADE_SIZE_USD'] || process.env['MAX_TRADE_SIZE_USD'], 100),
  drawdownTriggerPct: parseFraction(process.env['SOLANA_DRAWDOWN_TRIGGER_PCT'], 0.8),
  drawdownScale: parseFraction(process.env['SOLANA_DRAWDOWN_SCALE'], 0.5),
  maxNotionalUsd: parseNumber(process.env['SOLANA_MAX_NOTIONAL_USD'], 5),
  minExpectedProfitUsd: parseNonNegativeNumber(process.env['SOLANA_MIN_EXPECTED_PROFIT_USD'], 0.1),
  maxDailyLossUsd: parseNumber(process.env['SOLANA_MAX_DAILY_LOSS_USD'], 25),
  maxSlippageBps: parseNumber(process.env['SOLANA_MAX_SLIPPAGE_BPS'] || process.env['MAX_SLIPPAGE_BPS'], 50),
  quoteMaxAgeMs: parseNumber(process.env['QUOTE_MAX_AGE_MS'], 2_000),
  rpcUrl:
    process.env['SOLANA_RPC_URL_MAINNET_BETA'] ||
    process.env['SOLANA_RPC_URL'] ||
    '',
  privateKeyBase58:
    process.env['SOLANA_PRIVATE_KEY_BASE58'] ||
    process.env['SOLANA_PRIVATE_KEY_BASE58Y_BASE58'] ||
    process.env['SOLANA_ARB_SECRET_KEY'] ||
    process.env['SOLANA_TREASURY_SECRET_KEY'] ||
    '',
  jupiterBaseUrl: process.env['JUPITER_BASE_URL'] || 'https://lite-api.jup.ag/swap/v1',
};
