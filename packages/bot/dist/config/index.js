"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENABLED_DEXES = exports.DEX_CONFIG = exports.TOKEN_PAIRS = exports.ALLOWLISTED_TOKENS = exports.config = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
const tokens_1 = require("./tokens");
Object.defineProperty(exports, "ALLOWLISTED_TOKENS", { enumerable: true, get: function () { return tokens_1.ALLOWLISTED_TOKENS; } });
Object.defineProperty(exports, "TOKEN_PAIRS", { enumerable: true, get: function () { return tokens_1.TOKEN_PAIRS; } });
const dexes_1 = require("./dexes");
Object.defineProperty(exports, "DEX_CONFIG", { enumerable: true, get: function () { return dexes_1.DEX_CONFIG; } });
Object.defineProperty(exports, "ENABLED_DEXES", { enumerable: true, get: function () { return dexes_1.ENABLED_DEXES; } });
// Load environment variables
dotenv_1.default.config();
exports.config = {
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
function validateConfig() {
    const requiredFields = [
        'ethereumRpcUrl',
        'privateKey',
        'treasuryAddress'
    ];
    for (const field of requiredFields) {
        if (!exports.config[field]) {
            throw new Error(`Missing required configuration: ${field}`);
        }
    }
    if (exports.config.privateKey.length !== 66 || !exports.config.privateKey.startsWith('0x')) {
        throw new Error('Invalid private key format');
    }
    if (!exports.config.treasuryAddress.startsWith('0x') || exports.config.treasuryAddress.length !== 42) {
        throw new Error('Invalid treasury address format');
    }
}
//# sourceMappingURL=index.js.map