import { arbitrum, arbitrumSepolia, mainnet, polygon, polygonAmoy, sepolia } from 'viem/chains';
import { ALLOWLISTED_TOKENS, TOKEN_PAIRS } from './tokens';
import { DEX_CONFIG, ENABLED_DEXES } from './dexes';
import { Logger } from '../utils/Logger';

// Note: dotenv.config() is called in src/index.ts BEFORE this module is imported

const logger = new Logger('Config');

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isEnvTrue(value: string | undefined): boolean {
  const normalized = normalizeEnvValue(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function shouldAllowLocalRpc(): boolean {
  return isEnvTrue(process.env['ALLOW_LOCAL_RPC']);
}

function isLocalRpc(url: string | undefined): boolean {
  if (!url) return false;
  const value = url.trim().toLowerCase();
  return value.includes('localhost') || value.includes('127.0.0.1');
}

function sanitizeRpcUrl(url: string | undefined, fallback: string, chainName: string): string {
  const candidate = (url || '').trim();
  if (!candidate) return fallback;

  if (isLocalRpc(candidate) && !shouldAllowLocalRpc()) {
    logger.warn(`⚠️ Ignoring local RPC for ${chainName} in non-local mode; using fallback RPC.`);
    return fallback;
  }

  return candidate;
}

export interface BotConfig {
  // Ethereum Configuration
  ethereumRpcUrl: string;
  privateKey: string;
  walletAddress?: string | undefined;
  treasuryAddress: string;
  network: 'mainnet' | 'testnet';
  evmChain: 'arbitrum' | 'polygon' | 'ethereum';
  evmChainId: number;
  logOnly: boolean;
  allowTestnetTrades: boolean;
  
  // Bot Configuration
  minProfitEth: number;
  maxGasGwei: number;
  minProfitThreshold: number;
  scanIntervalMs: number;
  
  // Contract Configuration
  arbExecutorAddress: string;
  
  // Private Relay Configuration
  privateRelayUrl?: string | undefined;
  
  // Logging Configuration
  logLevel: string;
  
  // Risk Management
  maxSlippagePercent: number;
  maxGasPriceGwei: number;
  minLiquidityEth: number;

  // AI Scoring (optional)
  aiPredictUrl?: string | undefined;
  aiLogUrl?: string | undefined;
  aiServiceKey?: string | undefined;
  aiModelTag?: string | undefined;
  aiPredictionHorizonSec: number;
  aiMinSuccessProb: number;
  aiMinExpectedProfitPct: number;

  // Canary mode (optional)
  canaryEnabled: boolean;
  canaryNotionalEth: number;
  canaryMaxDailyLossEth: number;

  // Sanity execution mode (controlled test tx)
  sanityTxEnabled: boolean;
  sanityTxIntervalSec: number;
  sanityTxWei: string;
  sanityTxTo?: string | undefined;
}

function getEvmChainConfig() {
  const isTestnet = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase() === 'testnet';
  const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
  
  if (evmChain === 'polygon') {
    const fallback = isTestnet ? 'https://rpc-amoy.polygon.technology' : 'https://polygon-rpc.com';
    return {
      viemChain: isTestnet ? polygonAmoy : polygon,
      chainId: isTestnet ? 80002 : 137,
      rpcUrl: sanitizeRpcUrl(
        process.env['POLYGON_RPC_URL'] ||
        process.env['EVM_RPC_URL'] ||
        process.env['ETHEREUM_RPC_URL'],
        fallback,
        'polygon'
      ),
      name: evmChain
    };
  }
  if (evmChain === 'ethereum') {
    const fallback = isTestnet ? 'https://rpc.sepolia.org' : 'https://eth.llamarpc.com';
    return {
      viemChain: isTestnet ? sepolia : mainnet,
      chainId: isTestnet ? 11155111 : 1,
      rpcUrl: sanitizeRpcUrl(
        process.env['ETHEREUM_RPC_URL'] ||
        process.env['EVM_RPC_URL'] ||
        process.env['POLYGON_RPC_URL'],
        fallback,
        'ethereum'
      ),
      name: evmChain
    };
  }
  const fallback = isTestnet ? 'https://sepolia-rollup.arbitrum.io/rpc' : 'https://arb1.arbitrum.io/rpc';
  return {
    viemChain: isTestnet ? arbitrumSepolia : arbitrum,
    chainId: isTestnet ? 421614 : 42161,
    rpcUrl: sanitizeRpcUrl(
      process.env['ARBITRUM_RPC_URL'] ||
      process.env['ETHEREUM_RPC_URL'] ||
      process.env['EVM_RPC_URL'] ||
      process.env['POLYGON_RPC_URL'],
      fallback,
      'arbitrum'
    ),
    name: 'arbitrum'
  };
}

const evmChainConfig = getEvmChainConfig();

export const viemChain = evmChainConfig.viemChain;

// Create config object with current environment variables
function createConfig(): BotConfig {
  const chainConfig = getEvmChainConfig();
  const isTestnet = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase() === 'testnet';
  const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
  const allowTestnetTrades = isEnvTrue(process.env['ALLOW_TESTNET_TRADES']);
  const explicitLogOnly =
    isEnvTrue(process.env['LOG_ONLY']) ||
    isEnvTrue(process.env['BOT_LOG_ONLY']);
  const sanityTxEnabled = isEnvTrue(process.env['SANITY_TX_ENABLED'] ?? process.env['SANITY_MODE']);
  const sanityTxIntervalSec = parseInt(
    process.env['SANITY_TX_INTERVAL_SEC'] || process.env['SANITY_INTERVAL_SEC'] || '60',
    10
  );
  const sanityTxWei =
    normalizeEnvValue(process.env['SANITY_TX_WEI']) ||
    normalizeEnvValue(process.env['SANITY_VALUE_WEI']) ||
    '0';
  const sanityTxTo =
    normalizeEnvValue(process.env['SANITY_TX_TO']) ||
    normalizeEnvValue(process.env['SANITY_TO_ADDRESS']) ||
    undefined;
  
  return {
    // Ethereum Configuration
    ethereumRpcUrl: chainConfig.rpcUrl,
    privateKey: process.env['PRIVATE_KEY'] || '',
    walletAddress: process.env['WALLET_ADDRESS']?.trim() || undefined,
    treasuryAddress: process.env['TREASURY_ADDRESS'] || '',
    network: isTestnet ? 'testnet' : 'mainnet',
    evmChain: evmChain === 'polygon' || evmChain === 'ethereum' ? (evmChain as 'polygon' | 'ethereum') : 'arbitrum',
    evmChainId: chainConfig.chainId,
    logOnly: explicitLogOnly || (isTestnet && !allowTestnetTrades),
    allowTestnetTrades,
    
    // Bot Configuration
    minProfitEth: parseFloat(process.env['MIN_PROFIT_ETH'] || '0.01'),
    maxGasGwei: parseFloat(process.env['MAX_GAS_GWEI'] || '50'),
    minProfitThreshold: parseFloat(process.env['MIN_PROFIT_THRESHOLD'] || '0.005'),
    scanIntervalMs: parseInt(process.env['SCAN_INTERVAL_MS'] || '200'),
    
    // Contract Configuration
    arbExecutorAddress: process.env['ARB_EXECUTOR_ADDRESS'] || '',
    
    // Private Relay Configuration
    privateRelayUrl: process.env['PRIVATE_RELAY_URL'],
    
    // Logging Configuration
    logLevel: process.env['LOG_LEVEL'] || 'info',
    
    // Risk Management
    maxSlippagePercent: parseFloat(process.env['MAX_SLIPPAGE_PERCENT'] || '1.0'),
    maxGasPriceGwei: parseFloat(process.env['MAX_GAS_PRICE_GWEI'] || '100'),
    minLiquidityEth: parseFloat(process.env['MIN_LIQUIDITY_ETH'] || '10'),

    // AI Scoring (optional)
    aiPredictUrl: process.env['AI_PREDICT_URL'],
    aiLogUrl: process.env['AI_LOG_URL'],
    aiServiceKey: process.env['AI_SERVICE_KEY'],
    aiModelTag: process.env['AI_MODEL_TAG'],
    aiPredictionHorizonSec: parseInt(process.env['AI_PREDICTION_HORIZON_SEC'] || '900', 10),
    aiMinSuccessProb: parseFloat(process.env['AI_MIN_SUCCESS_PROB'] || '0.7'),
    aiMinExpectedProfitPct: parseFloat(process.env['AI_MIN_EXPECTED_PROFIT_PCT'] || '0.5'),

    // Canary mode (optional)
    canaryEnabled: isEnvTrue(process.env['CANARY_ENABLED']),
    canaryNotionalEth: parseFloat(process.env['CANARY_NOTIONAL_ETH'] || '0.01'),
    canaryMaxDailyLossEth: parseFloat(process.env['CANARY_MAX_DAILY_LOSS_ETH'] || '0.005'),

    sanityTxEnabled,
    sanityTxIntervalSec,
    sanityTxWei,
    sanityTxTo,
  };
}

export let config: BotConfig = createConfig();

// Function to refresh config after env vars are loaded
export function refreshConfig(): void {
  config = createConfig();
}

// Validation
export function validateConfig(): void {
  // Re-read environment variables at validation time (they're set by dotenv.config() at startup)
  const privateKey = process.env['PRIVATE_KEY']?.trim() || '';
  const walletAddress = process.env['WALLET_ADDRESS']?.trim() || '';
  const treasuryAddress = process.env['TREASURY_ADDRESS'] || '';
  const ethereumRpcUrl =
    process.env['ETHEREUM_RPC_URL'] ||
    process.env['ARBITRUM_RPC_URL'] ||
    process.env['POLYGON_RPC_URL'] ||
    process.env['EVM_RPC_URL'] ||
    '';
  const logOnly =
    isEnvTrue(process.env['LOG_ONLY']) ||
    isEnvTrue(process.env['BOT_LOG_ONLY']) ||
    (normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase() === 'testnet' && !isEnvTrue(process.env['ALLOW_TESTNET_TRADES']));

  // Always require RPC URL
  if (!ethereumRpcUrl) {
    throw new Error('Missing required configuration: ethereumRpcUrl (set ETHEREUM_RPC_URL or chain-specific RPC_URL)');
  }

  const canaryEnabled = isEnvTrue(process.env['CANARY_ENABLED']);
  const canaryNotionalEth = parseFloat(process.env['CANARY_NOTIONAL_ETH'] || '0.01');
  const canaryMaxDailyLossEth = parseFloat(process.env['CANARY_MAX_DAILY_LOSS_ETH'] || '0.005');
  const sanityTxEnabled = isEnvTrue(process.env['SANITY_TX_ENABLED'] ?? process.env['SANITY_MODE']);
  const sanityTxIntervalSec = parseInt(
    process.env['SANITY_TX_INTERVAL_SEC'] || process.env['SANITY_INTERVAL_SEC'] || '60',
    10
  );
  const sanityTxWei =
    normalizeEnvValue(process.env['SANITY_TX_WEI']) ||
    normalizeEnvValue(process.env['SANITY_VALUE_WEI']) ||
    '0';
  const sanityTxTo =
    normalizeEnvValue(process.env['SANITY_TX_TO']) ||
    normalizeEnvValue(process.env['SANITY_TO_ADDRESS']) ||
    '';

  if (canaryEnabled) {
    if (!Number.isFinite(canaryNotionalEth) || canaryNotionalEth <= 0) {
      throw new Error('Invalid canary configuration: CANARY_NOTIONAL_ETH must be a positive number');
    }
    if (!Number.isFinite(canaryMaxDailyLossEth) || canaryMaxDailyLossEth <= 0) {
      throw new Error('Invalid canary configuration: CANARY_MAX_DAILY_LOSS_ETH must be a positive number');
    }
  }

  if (walletAddress && (!walletAddress.startsWith('0x') || walletAddress.length !== 42)) {
    throw new Error('Invalid WALLET_ADDRESS format (must be 42 chars starting with 0x)');
  }

  if (sanityTxEnabled) {
    if (!Number.isFinite(sanityTxIntervalSec) || sanityTxIntervalSec <= 0) {
      throw new Error('Invalid SANITY_TX_INTERVAL_SEC (must be a positive integer)');
    }
    try {
      const amount = BigInt(sanityTxWei);
      if (amount < 0n) {
        throw new Error('negative');
      }
    } catch {
      throw new Error('Invalid SANITY_TX_WEI (must be an integer string >= 0)');
    }
    if (sanityTxTo && (!sanityTxTo.startsWith('0x') || sanityTxTo.length !== 42)) {
      throw new Error('Invalid SANITY_TX_TO format (must be 42 chars starting with 0x)');
    }
  }

  // If trading, require private key and treasury
  if (!logOnly) {
    if (!privateKey) {
      throw new Error('Missing required configuration: privateKey (set PRIVATE_KEY or LOG_ONLY=true for logging-only mode)');
    }
    if (!treasuryAddress) {
      throw new Error('Missing required configuration: treasuryAddress (set TREASURY_ADDRESS or LOG_ONLY=true)');
    }
    // Validate private key format if present
    if (privateKey.length !== 66 || !privateKey.startsWith('0x')) {
      throw new Error('Invalid private key format (must be 66 chars starting with 0x)');
    }
    // Validate treasury address format if present
    if (treasuryAddress && (!treasuryAddress.startsWith('0x') || treasuryAddress.length !== 42)) {
      throw new Error('Invalid treasury address format (must be 42 chars starting with 0x)');
    }
  } else {
    // LOG_ONLY: warn if key is missing/invalid, but do not throw
    if (!privateKey || privateKey.length !== 66 || !privateKey.startsWith('0x')) {
      if (walletAddress) {
        logger.warn('⚠️ LOG_ONLY: PRIVATE_KEY missing/invalid; using WALLET_ADDRESS identity fallback.');
      } else {
        logger.warn('⚠️ LOG_ONLY: PRIVATE_KEY and WALLET_ADDRESS both missing; running without wallet identity.');
      }
    }
  }
}

// Export all configurations
export { ALLOWLISTED_TOKENS, TOKEN_PAIRS, DEX_CONFIG, ENABLED_DEXES };
