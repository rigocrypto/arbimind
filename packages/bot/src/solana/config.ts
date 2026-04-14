/**
 * Solana Bot Configuration
 * Pools, scanners, and AI scoring for Raydium/Pump.fun DEX
 */

import type { RiskPolicyConfig } from './riskPolicy';
import type { RiskTier } from './venueRisk';
import type { IncidentType } from './incidentRegistry';
import type { PriorityFeeConfig } from './PriorityFeeEstimator';
import { parseSpeedTier, type SpeedTier } from './SpeedTierPolicy';

export type BaseAsset = 'USDC' | 'USDT';

export interface InventoryConfig {
  autoFundEnabled: boolean;
  baseAsset: BaseAsset;
  baseAssetMint: string;
  minSolReserve: number;
  targetSolReserve: number;
  autoFundMinSwapUsd: number;
  fundingRebalanceIntervalMs: number;
  fundingCooldownMs: number;
  positionSizeFraction: number;
  minTradeUsd: number;
  maxTradeUsd: number;
  compoundProfits: boolean;
}

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
  allowMultihop: boolean;
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
  minNotionalUsd: number;
  minExpectedProfitUsd: number;
  maxDailyLossUsd: number;
  maxSlippageBps: number;
  quoteMaxAgeMs: number;
  rpcUrl: string;
  privateKeyBase58: string;
  jupiterBaseUrl: string;
  riskPolicy: RiskPolicyConfig;
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
  allowMultihop: isEnvTrue(process.env['SOLANA_ALLOW_MULTIHOP']),
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
  minNotionalUsd: parseNonNegativeNumber(process.env['SOLANA_MIN_NOTIONAL_USD'], 3),
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
  riskPolicy: {
    denyTiers: (process.env['SOLANA_RISK_DENY_TIERS'] ?? 'critical').split(',').map(s => s.trim()).filter(Boolean) as RiskTier[],
    canaryTiers: (process.env['SOLANA_RISK_CANARY_TIERS'] ?? 'high').split(',').map(s => s.trim()).filter(Boolean) as RiskTier[],
    canaryMaxNotionalUsd: parseNumber(process.env['SOLANA_RISK_CANARY_MAX_USD'], 1),
    minEdgeBumpBps: parseNonNegativeNumber(process.env['SOLANA_RISK_EDGE_BUMP_BPS'], 15),
    incidentCooldownDays: parseNonNegativeNumber(process.env['SOLANA_RISK_INCIDENT_COOLDOWN_DAYS'], 30),
    denyIncidentTypes: (process.env['SOLANA_RISK_DENY_INCIDENT_TYPES'] ?? 'governance_compromise').split(',').map(s => s.trim()).filter(Boolean) as IncidentType[],
  },
};

const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

function parseBaseAsset(value: string | undefined): BaseAsset {
  const v = (value || '').trim().toUpperCase();
  return v === 'USDT' ? 'USDT' : 'USDC';
}

export const inventoryConfig: InventoryConfig = {
  autoFundEnabled: isEnvTrue(process.env['SOLANA_AUTO_FUND_ENABLED']),
  baseAsset: parseBaseAsset(process.env['SOLANA_BASE_ASSET']),
  baseAssetMint: parseBaseAsset(process.env['SOLANA_BASE_ASSET']) === 'USDT' ? MINT_USDT : MINT_USDC,
  minSolReserve: parseNumber(process.env['SOLANA_MIN_SOL_RESERVE'], 0.15),
  targetSolReserve: parseNumber(process.env['SOLANA_TARGET_SOL_RESERVE'], 0.25),
  autoFundMinSwapUsd: parseNumber(process.env['SOLANA_AUTO_FUND_MIN_SWAP_USD'], 25),
  fundingRebalanceIntervalMs: parseNumber(process.env['SOLANA_FUNDING_REBALANCE_INTERVAL_MS'], 30_000),
  fundingCooldownMs: parseNumber(process.env['SOLANA_FUNDING_COOLDOWN_MS'], 300_000),
  positionSizeFraction: parseFraction(process.env['SOLANA_POSITION_SIZE_FRACTION'], 0.25),
  minTradeUsd: parseNumber(process.env['SOLANA_MIN_TRADE_USD'], 20),
  maxTradeUsd: parseNumber(process.env['SOLANA_MAX_TRADE_USD'], 250),
  compoundProfits: !isEnvFalse(process.env['SOLANA_COMPOUND_PROFITS'] ?? 'true'),
};

export const priorityFeeConfig: Partial<PriorityFeeConfig> = {
  enabled: !isEnvFalse(process.env['SOLANA_DYNAMIC_PRIORITY_FEE'] ?? 'true'),
  percentile: parseNumber(process.env['SOLANA_PRIORITY_FEE_PERCENTILE'], 75),
  floorLamports: parseNumber(process.env['SOLANA_PRIORITY_FEE_FLOOR_LAMPORTS'], 10_000),
  capLamports: parseNumber(process.env['SOLANA_PRIORITY_FEE_CAP_LAMPORTS'], 5_000_000),
  staticDefaultLamports: parseNumber(
    process.env['SOLANA_PRIORITY_FEE_MICROLAMPORTS'] ?? process.env['SOLANA_PRIORITY_FEE_STATIC_LAMPORTS'],
    1_000_000,
  ),
  cacheTtlMs: parseNumber(process.env['SOLANA_PRIORITY_FEE_CACHE_TTL_MS'], 10_000),
};

// ── EXP-020: Fee-aware execution gating ──────────────────────────────
export interface Exp020Config {
  speedTier: SpeedTier;
  minNetProfitUsd: number;
  riskBufferUsd: number;
  slippageFallbackUsd: number;
  slippageDiscountFactor: number;
  maxRebalanceCostBps: number;
  landingRateWarningThreshold: number;
  landingRateAutoEscalate: boolean;
  netEdgeWindow: number;
}

export const exp020Config: Exp020Config = {
  speedTier: parseSpeedTier(process.env['SOLANA_SPEED_TIER']),
  minNetProfitUsd: parseNonNegativeNumber(process.env['SOLANA_MIN_NET_PROFIT_USD'], 0.10),
  riskBufferUsd: parseNonNegativeNumber(process.env['SOLANA_RISK_BUFFER_USD'], 0.05),
  slippageFallbackUsd: parseNonNegativeNumber(process.env['SOLANA_SLIPPAGE_FALLBACK_USD'], 0.02),
  slippageDiscountFactor: parseFraction(process.env['SOLANA_SLIPPAGE_DISCOUNT_FACTOR'], 0.5),
  maxRebalanceCostBps: parseNumber(process.env['SOLANA_AUTO_FUND_MAX_REBALANCE_COST_BPS'], 100),
  landingRateWarningThreshold: parseFraction(process.env['SOLANA_LANDING_RATE_WARNING_THRESHOLD'], 0.70),
  landingRateAutoEscalate: !isEnvFalse(process.env['SOLANA_LANDING_RATE_AUTO_ESCALATE'] ?? 'true'),
  netEdgeWindow: parseNumber(process.env['SOLANA_NET_EDGE_WINDOW'], 20),
};
