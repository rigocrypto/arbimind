import dotenv from 'dotenv';
import { arbitrum, arbitrumSepolia, mainnet, polygon, polygonAmoy, sepolia } from 'viem/chains';
import { ALLOWLISTED_TOKENS, TOKEN_PAIRS } from './tokens';
import { DEX_CONFIG, ENABLED_DEXES } from './dexes';

// Note: dotenv.config() is called in src/index.ts BEFORE this module is imported

export interface BotConfig {
  // Ethereum Configuration
  ethereumRpcUrl: string;
  privateKey: string;
  treasuryAddress: string;
  network: 'mainnet' | 'testnet';
  evmChain: 'arbitrum' | 'polygon' | 'ethereum';
  evmChainId: number;
  logOnly: boolean;
  
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
}

const isTestnet = (process.env['NETWORK'] || 'mainnet') === 'testnet';
const evmChain = (process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();

function getEvmChainConfig() {
  if (evmChain === 'polygon') {
    return {
      viemChain: isTestnet ? polygonAmoy : polygon,
      chainId: isTestnet ? 80002 : 137,
      rpcUrl: process.env['POLYGON_RPC_URL']
    };
  }
  if (evmChain === 'ethereum') {
    return {
      viemChain: isTestnet ? sepolia : mainnet,
      chainId: isTestnet ? 11155111 : 1,
      rpcUrl: process.env['ETHEREUM_RPC_URL']
    };
  }
  return {
    viemChain: isTestnet ? arbitrumSepolia : arbitrum,
    chainId: isTestnet ? 421614 : 42161,
    rpcUrl: process.env['ARBITRUM_RPC_URL'] || process.env['ETHEREUM_RPC_URL']
  };
}

const evmChainConfig = getEvmChainConfig();

export const viemChain = evmChainConfig.viemChain;

// Create config object with current environment variables
function createConfig(): BotConfig {
  return {
    // Ethereum Configuration
    ethereumRpcUrl: getEvmChainConfig().rpcUrl || 'http://localhost:8545',
    privateKey: process.env['PRIVATE_KEY'] || '',
    treasuryAddress: process.env['TREASURY_ADDRESS'] || '',
    network: isTestnet ? 'testnet' : 'mainnet',
    evmChain: evmChain === 'polygon' || evmChain === 'ethereum' ? (evmChain as 'polygon' | 'ethereum') : 'arbitrum',
    evmChainId: getEvmChainConfig().chainId,
    logOnly: isTestnet || process.env['BOT_LOG_ONLY'] === 'true',
    
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
    aiMinExpectedProfitPct: parseFloat(process.env['AI_MIN_EXPECTED_PROFIT_PCT'] || '0.5')
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
  const privateKey = process.env['PRIVATE_KEY'] || '';
  const treasuryAddress = process.env['TREASURY_ADDRESS'] || '';
  const ethereumRpcUrl = process.env['ETHEREUM_RPC_URL'] || process.env['ARBITRUM_RPC_URL'] || process.env['POLYGON_RPC_URL'] || '';

  const requiredFields: Record<string, string> = {
    privateKey,
    treasuryAddress,
    ethereumRpcUrl
  };
  
  for (const [field, value] of Object.entries(requiredFields)) {
    if (!value) {
      throw new Error(`Missing required configuration: ${field}`);
    }
  }
  
  if (privateKey.length !== 66 || !privateKey.startsWith('0x')) {
    throw new Error('Invalid private key format');
  }
  
  if (!treasuryAddress.startsWith('0x') || treasuryAddress.length !== 42) {
    throw new Error('Invalid treasury address format');
  }
}

// Export all configurations
export { ALLOWLISTED_TOKENS, TOKEN_PAIRS, DEX_CONFIG, ENABLED_DEXES };
