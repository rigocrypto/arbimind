import dotenv from 'dotenv';
import { ALLOWLISTED_TOKENS, TOKEN_PAIRS } from './tokens';
import { DEX_CONFIG, ENABLED_DEXES } from './dexes';

// Load environment variables
dotenv.config();

export interface BotConfig {
  // Ethereum Configuration
  ethereumRpcUrl: string;
  privateKey: string;
  treasuryAddress: string;
  
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
}

export const config: BotConfig = {
  // Ethereum Configuration
  ethereumRpcUrl: process.env['ETHEREUM_RPC_URL'] || 'http://localhost:8545',
  privateKey: process.env['PRIVATE_KEY'] || '',
  treasuryAddress: process.env['TREASURY_ADDRESS'] || '',
  
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
  minLiquidityEth: parseFloat(process.env['MIN_LIQUIDITY_ETH'] || '10')
};

// Validation
export function validateConfig(): void {
  const requiredFields = [
    'ethereumRpcUrl',
    'privateKey',
    'treasuryAddress'
  ];
  
  for (const field of requiredFields) {
    if (!config[field as keyof BotConfig]) {
      throw new Error(`Missing required configuration: ${field}`);
    }
  }
  
  if (config.privateKey.length !== 66 || !config.privateKey.startsWith('0x')) {
    throw new Error('Invalid private key format');
  }
  
  if (!config.treasuryAddress.startsWith('0x') || config.treasuryAddress.length !== 42) {
    throw new Error('Invalid treasury address format');
  }
}

// Export all configurations
export { ALLOWLISTED_TOKENS, TOKEN_PAIRS, DEX_CONFIG, ENABLED_DEXES };
