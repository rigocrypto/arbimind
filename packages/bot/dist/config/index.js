"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENABLED_DEXES = exports.DEX_CONFIG = exports.TOKEN_PAIRS = exports.ALLOWLISTED_TOKENS = exports.validateConfig = exports.refreshConfig = exports.config = exports.viemChain = void 0;
const chains_1 = require("viem/chains");
const tokens_1 = require("./tokens");
Object.defineProperty(exports, "ALLOWLISTED_TOKENS", { enumerable: true, get: function () { return tokens_1.ALLOWLISTED_TOKENS; } });
Object.defineProperty(exports, "TOKEN_PAIRS", { enumerable: true, get: function () { return tokens_1.TOKEN_PAIRS; } });
const dexes_1 = require("./dexes");
Object.defineProperty(exports, "DEX_CONFIG", { enumerable: true, get: function () { return dexes_1.DEX_CONFIG; } });
Object.defineProperty(exports, "ENABLED_DEXES", { enumerable: true, get: function () { return dexes_1.ENABLED_DEXES; } });
function getEvmChainConfig() {
    const isTestnet = (process.env['NETWORK'] || 'mainnet') === 'testnet';
    const evmChain = (process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
    if (evmChain === 'polygon') {
        return {
            viemChain: isTestnet ? chains_1.polygonAmoy : chains_1.polygon,
            chainId: isTestnet ? 80002 : 137,
            rpcUrl: process.env['POLYGON_RPC_URL'],
            name: evmChain
        };
    }
    if (evmChain === 'ethereum') {
        return {
            viemChain: isTestnet ? chains_1.sepolia : chains_1.mainnet,
            chainId: isTestnet ? 11155111 : 1,
            rpcUrl: process.env['ETHEREUM_RPC_URL'],
            name: evmChain
        };
    }
    return {
        viemChain: isTestnet ? chains_1.arbitrumSepolia : chains_1.arbitrum,
        chainId: isTestnet ? 421614 : 42161,
        rpcUrl: process.env['ARBITRUM_RPC_URL'] || process.env['ETHEREUM_RPC_URL'],
        name: 'arbitrum'
    };
}
const evmChainConfig = getEvmChainConfig();
exports.viemChain = evmChainConfig.viemChain;
// Create config object with current environment variables
function createConfig() {
    const chainConfig = getEvmChainConfig();
    const isTestnet = (process.env['NETWORK'] || 'mainnet') === 'testnet';
    const evmChain = (process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
    return {
        // Ethereum Configuration
        ethereumRpcUrl: chainConfig.rpcUrl || 'http://localhost:8545',
        privateKey: process.env['PRIVATE_KEY'] || '',
        treasuryAddress: process.env['TREASURY_ADDRESS'] || '',
        network: isTestnet ? 'testnet' : 'mainnet',
        evmChain: evmChain === 'polygon' || evmChain === 'ethereum' ? evmChain : 'arbitrum',
        evmChainId: chainConfig.chainId,
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
exports.config = createConfig();
// Function to refresh config after env vars are loaded
function refreshConfig() {
    exports.config = createConfig();
}
exports.refreshConfig = refreshConfig;
// Validation
function validateConfig() {
    // Re-read environment variables at validation time (they're set by dotenv.config() at startup)
    const privateKey = process.env['PRIVATE_KEY']?.trim() || '';
    const treasuryAddress = process.env['TREASURY_ADDRESS'] || '';
    const ethereumRpcUrl = process.env['ETHEREUM_RPC_URL'] || process.env['ARBITRUM_RPC_URL'] || process.env['POLYGON_RPC_URL'] || '';
    const logOnly = process.env['LOG_ONLY'] === 'true' || (process.env['NETWORK'] || 'mainnet') === 'testnet';
    // Always require RPC URL
    if (!ethereumRpcUrl) {
        throw new Error('Missing required configuration: ethereumRpcUrl (set ETHEREUM_RPC_URL or chain-specific RPC_URL)');
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
    }
    else {
        // LOG_ONLY: warn if key is missing/invalid, but do not throw
        if (!privateKey || privateKey.length !== 66 || !privateKey.startsWith('0x')) {
            // eslint-disable-next-line no-console
            console.warn('⚠️ LOG_ONLY: PRIVATE_KEY missing or invalid, running without wallet.');
        }
    }
}
exports.validateConfig = validateConfig;
