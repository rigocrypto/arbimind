"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENABLED_DEXES = exports.DEX_CONFIG = exports.TOKEN_PAIRS = exports.ALLOWLISTED_TOKENS = exports.config = exports.viemChain = void 0;
exports.refreshConfig = refreshConfig;
exports.validateConfig = validateConfig;
const chains_1 = require("viem/chains");
const tokens_1 = require("./tokens");
Object.defineProperty(exports, "ALLOWLISTED_TOKENS", { enumerable: true, get: function () { return tokens_1.ALLOWLISTED_TOKENS; } });
Object.defineProperty(exports, "TOKEN_PAIRS", { enumerable: true, get: function () { return tokens_1.TOKEN_PAIRS; } });
const dexes_1 = require("./dexes");
Object.defineProperty(exports, "DEX_CONFIG", { enumerable: true, get: function () { return dexes_1.DEX_CONFIG; } });
Object.defineProperty(exports, "ENABLED_DEXES", { enumerable: true, get: function () { return dexes_1.ENABLED_DEXES; } });
const Logger_1 = require("../utils/Logger");
// Note: dotenv.config() is called in src/index.ts BEFORE this module is imported
const logger = new Logger_1.Logger('Config');
const MAINNET_V2_ROUTER = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
const MAINNET_V3_QUOTER = '0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6';
function normalizeEnvValue(value) {
    if (!value)
        return '';
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}
function normalizeAddress(value) {
    return normalizeEnvValue(value).toLowerCase();
}
function isEnvTrue(value) {
    const normalized = normalizeEnvValue(value).toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}
function shouldAllowLocalRpc() {
    return isEnvTrue(process.env['ALLOW_LOCAL_RPC']);
}
function isLocalRpc(url) {
    if (!url)
        return false;
    const value = url.trim().toLowerCase();
    return value.includes('localhost') || value.includes('127.0.0.1');
}
function sanitizeRpcUrl(url, fallback, chainName) {
    const candidate = (url || '').trim();
    if (!candidate)
        return fallback;
    if (isLocalRpc(candidate) && !shouldAllowLocalRpc()) {
        logger.warn(`⚠️ Ignoring local RPC for ${chainName} in non-local mode; using fallback RPC.`);
        return fallback;
    }
    return candidate;
}
function getEvmChainConfig() {
    const isTestnet = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase() === 'testnet';
    const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
    if (evmChain === 'polygon') {
        const fallback = isTestnet ? 'https://rpc-amoy.polygon.technology' : 'https://polygon-rpc.com';
        return {
            viemChain: isTestnet ? chains_1.polygonAmoy : chains_1.polygon,
            chainId: isTestnet ? 80002 : 137,
            rpcUrl: sanitizeRpcUrl(process.env['POLYGON_RPC_URL'] ||
                process.env['EVM_RPC_URL'] ||
                process.env['ETHEREUM_RPC_URL'], fallback, 'polygon'),
            name: evmChain
        };
    }
    if (evmChain === 'ethereum') {
        const fallback = isTestnet ? 'https://rpc.sepolia.org' : 'https://eth.llamarpc.com';
        return {
            viemChain: isTestnet ? chains_1.sepolia : chains_1.mainnet,
            chainId: isTestnet ? 11155111 : 1,
            rpcUrl: sanitizeRpcUrl(process.env['ETHEREUM_RPC_URL'] ||
                process.env['EVM_RPC_URL'] ||
                process.env['POLYGON_RPC_URL'], fallback, 'ethereum'),
            name: evmChain
        };
    }
    const fallback = isTestnet ? 'https://sepolia-rollup.arbitrum.io/rpc' : 'https://arb1.arbitrum.io/rpc';
    return {
        viemChain: isTestnet ? chains_1.arbitrumSepolia : chains_1.arbitrum,
        chainId: isTestnet ? 421614 : 42161,
        rpcUrl: sanitizeRpcUrl(process.env['ARBITRUM_RPC_URL'] ||
            process.env['ETHEREUM_RPC_URL'] ||
            process.env['EVM_RPC_URL'] ||
            process.env['POLYGON_RPC_URL'], fallback, 'arbitrum'),
        name: 'arbitrum'
    };
}
function isEthereumSepoliaProfile() {
    const network = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase();
    const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
    return network === 'testnet' && evmChain === 'ethereum';
}
function isV3QuotesExplicitlyDisabled() {
    const value = normalizeEnvValue(process.env['ENABLE_V3_QUOTES'] || process.env['SEPOLIA_ENABLE_V3_QUOTES']).toLowerCase();
    return value === 'false' || value === '0' || value === 'no' || value === 'off';
}
function parseScanPairs() {
    return normalizeEnvValue(process.env['SCAN_PAIRS'])
        .split(',')
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean);
}
function hasPairMatch(pair, configuredPairSet) {
    if (configuredPairSet.has(pair))
        return true;
    const [a, b] = pair.split('/');
    if (!a || !b)
        return false;
    return configuredPairSet.has(`${b}/${a}`);
}
function isIntentionalReducedSepoliaMode() {
    if (!isEthereumSepoliaProfile())
        return false;
    if (!isV3QuotesExplicitlyDisabled())
        return false;
    const requestedPairs = parseScanPairs();
    if (requestedPairs.length === 0)
        return false;
    const enabledDexes = Object.values(dexes_1.DEX_CONFIG).filter((entry) => entry.enabled);
    if (enabledDexes.length < 1)
        return false;
    const configuredPairSet = new Set(tokens_1.TOKEN_PAIRS.map((p) => `${p.tokenA}/${p.tokenB}`.toUpperCase()));
    const matchingPairs = requestedPairs.filter((pair) => hasPairMatch(pair, configuredPairSet));
    if (matchingPairs.length === 0)
        return false;
    return matchingPairs.every((pair) => {
        const [tokenA, tokenB] = pair.split('/');
        return Boolean(tokens_1.ALLOWLISTED_TOKENS[tokenA]) && Boolean(tokens_1.ALLOWLISTED_TOKENS[tokenB]);
    });
}
function hasValidSepoliaProfile() {
    if (!isEthereumSepoliaProfile()) {
        return true;
    }
    if (isIntentionalReducedSepoliaMode()) {
        return true;
    }
    const hasWeth = Boolean(tokens_1.ALLOWLISTED_TOKENS['WETH']?.address);
    const hasTokenPairs = tokens_1.TOKEN_PAIRS.length > 0;
    const enabledDexes = Object.values(dexes_1.DEX_CONFIG).filter((entry) => entry.enabled);
    return hasWeth && hasTokenPairs && enabledDexes.length >= 2;
}
const evmChainConfig = getEvmChainConfig();
exports.viemChain = evmChainConfig.viemChain;
// Create config object with current environment variables
function createConfig() {
    const chainConfig = getEvmChainConfig();
    const isTestnet = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase() === 'testnet';
    const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
    const allowTestnetTrades = isEnvTrue(process.env['ALLOW_TESTNET_TRADES']);
    const explicitLogOnly = isEnvTrue(process.env['LOG_ONLY']) ||
        isEnvTrue(process.env['BOT_LOG_ONLY']);
    const sepoliaProfileReady = hasValidSepoliaProfile();
    const forcedLogOnlyForSafety = isEthereumSepoliaProfile() && !sepoliaProfileReady;
    const sanityTxEnabled = isEnvTrue(process.env['SANITY_TX_ENABLED'] ?? process.env['SANITY_MODE']);
    const sanityTxIntervalSec = parseInt(process.env['SANITY_TX_INTERVAL_SEC'] || process.env['SANITY_INTERVAL_SEC'] || '60', 10);
    const sanityTxWei = normalizeEnvValue(process.env['SANITY_TX_WEI']) ||
        normalizeEnvValue(process.env['SANITY_VALUE_WEI']) ||
        '0';
    const sanityTxTo = normalizeEnvValue(process.env['SANITY_TX_TO']) ||
        normalizeEnvValue(process.env['SANITY_TO_ADDRESS']) ||
        undefined;
    return {
        // Ethereum Configuration
        ethereumRpcUrl: chainConfig.rpcUrl,
        privateKey: process.env['PRIVATE_KEY'] || '',
        walletAddress: process.env['WALLET_ADDRESS']?.trim() || undefined,
        treasuryAddress: process.env['TREASURY_ADDRESS'] || '',
        network: isTestnet ? 'testnet' : 'mainnet',
        evmChain: evmChain === 'polygon' || evmChain === 'ethereum' ? evmChain : 'arbitrum',
        evmChainId: chainConfig.chainId,
        logOnly: forcedLogOnlyForSafety || explicitLogOnly || (isTestnet && !allowTestnetTrades),
        allowTestnetTrades,
        // Bot Configuration
        minProfitEth: parseFloat(process.env['MIN_PROFIT_ETH'] || '0.01'),
        maxGasGwei: parseFloat(process.env['MAX_GAS_GWEI'] || '50'),
        minProfitThreshold: parseFloat(process.env['MIN_PROFIT_THRESHOLD'] || '0.005'),
        scanIntervalMs: parseInt(process.env['SCAN_INTERVAL_MS'] || (isTestnet ? '5000' : '200'), 10),
        // Contract Configuration
        arbExecutorAddress: process.env['ARB_EXECUTOR_ADDRESS'] || '',
        // Private Relay Configuration
        privateRelayUrl: process.env['PRIVATE_RELAY_URL'],
        // Logging Configuration
        logLevel: process.env['LOG_LEVEL'] || 'info',
        // Risk Management
        maxSlippagePercent: parseFloat(process.env['MAX_SLIPPAGE_PERCENT'] || '1.0'),
        maxSlippageBps: parseInt(process.env['MAX_SLIPPAGE_BPS'] || '100', 10),
        maxGasPriceGwei: parseFloat(process.env['MAX_GAS_PRICE_GWEI'] || '100'),
        minLiquidityEth: parseFloat(process.env['MIN_LIQUIDITY_ETH'] || '10'),
        minProfitUsd: parseFloat(process.env['MIN_PROFIT_USD'] || '1.0'),
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
        minEdgeBps: parseInt(process.env['MIN_EDGE_BPS'] || '10', 10),
        swapAmountEth: parseFloat(process.env['SWAP_AMOUNT_ETH'] || '0.001'),
    };
}
exports.config = createConfig();
// Function to refresh config after env vars are loaded
function refreshConfig() {
    exports.config = createConfig();
}
// Validation
function validateConfig() {
    // Re-read environment variables at validation time (they're set by dotenv.config() at startup)
    const privateKey = process.env['PRIVATE_KEY']?.trim() || '';
    const walletAddress = process.env['WALLET_ADDRESS']?.trim() || '';
    const treasuryAddress = process.env['TREASURY_ADDRESS'] || '';
    const ethereumRpcUrl = process.env['ETHEREUM_RPC_URL'] ||
        process.env['ARBITRUM_RPC_URL'] ||
        process.env['POLYGON_RPC_URL'] ||
        process.env['EVM_RPC_URL'] ||
        '';
    const logOnly = isEnvTrue(process.env['LOG_ONLY']) ||
        isEnvTrue(process.env['BOT_LOG_ONLY']) ||
        (normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase() === 'testnet' && !isEnvTrue(process.env['ALLOW_TESTNET_TRADES'])) ||
        (isEthereumSepoliaProfile() && !hasValidSepoliaProfile());
    // Always require RPC URL
    if (!ethereumRpcUrl) {
        throw new Error('Missing required configuration: ethereumRpcUrl (set ETHEREUM_RPC_URL or chain-specific RPC_URL)');
    }
    const canaryEnabled = isEnvTrue(process.env['CANARY_ENABLED']);
    const canaryNotionalEth = parseFloat(process.env['CANARY_NOTIONAL_ETH'] || '0.01');
    const canaryMaxDailyLossEth = parseFloat(process.env['CANARY_MAX_DAILY_LOSS_ETH'] || '0.005');
    const sanityTxEnabled = isEnvTrue(process.env['SANITY_TX_ENABLED'] ?? process.env['SANITY_MODE']);
    const sanityTxIntervalSec = parseInt(process.env['SANITY_TX_INTERVAL_SEC'] || process.env['SANITY_INTERVAL_SEC'] || '60', 10);
    const sanityTxWei = normalizeEnvValue(process.env['SANITY_TX_WEI']) ||
        normalizeEnvValue(process.env['SANITY_VALUE_WEI']) ||
        '0';
    const sanityTxTo = normalizeEnvValue(process.env['SANITY_TX_TO']) ||
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
    if (isEthereumSepoliaProfile() && !hasValidSepoliaProfile()) {
        logger.warn('⚠️ Ethereum Sepolia profile incomplete: forcing LOG_ONLY. Configure SEPOLIA_* token/router/factory addresses and at least two enabled DEXes.');
    }
    if (isEthereumSepoliaProfile()) {
        const sepoliaV2Router = normalizeAddress(process.env['SEPOLIA_UNISWAP_V2_ROUTER'] || process.env['UNISWAP_V2_ROUTER']);
        const sepoliaV3Quoter = normalizeAddress(process.env['SEPOLIA_UNISWAP_V3_QUOTER'] || process.env['UNISWAP_V3_QUOTER']);
        const sepoliaV3RouterRaw = normalizeEnvValue(process.env['SEPOLIA_UNISWAP_V3_ROUTER'] || process.env['UNISWAP_V3_ROUTER']);
        if (sepoliaV2Router && sepoliaV2Router === MAINNET_V2_ROUTER) {
            throw new Error('Invalid Sepolia config: SEPOLIA_UNISWAP_V2_ROUTER points to mainnet router 0x7a25...');
        }
        if (sepoliaV3Quoter && sepoliaV3Quoter === MAINNET_V3_QUOTER) {
            throw new Error('Invalid Sepolia config: SEPOLIA_UNISWAP_V3_QUOTER points to mainnet quoter 0xb273...');
        }
        if (sepoliaV3RouterRaw && (!sepoliaV3RouterRaw.startsWith('0x') || sepoliaV3RouterRaw.length !== 42)) {
            logger.warn('Invalid SEPOLIA_UNISWAP_V3_ROUTER format; V3 swap approvals/execution will be skipped until fixed.');
        }
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
        }
        catch {
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
    }
    else {
        // LOG_ONLY: warn if key is missing/invalid, but do not throw
        if (!privateKey || privateKey.length !== 66 || !privateKey.startsWith('0x')) {
            if (walletAddress) {
                logger.warn('⚠️ LOG_ONLY: PRIVATE_KEY missing/invalid; using WALLET_ADDRESS identity fallback.');
            }
            else {
                logger.warn('⚠️ LOG_ONLY: PRIVATE_KEY and WALLET_ADDRESS both missing; running without wallet identity.');
            }
        }
    }
}
