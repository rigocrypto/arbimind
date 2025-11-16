"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENABLED_DEXES = exports.DEX_CONFIG = void 0;
exports.getDexConfig = getDexConfig;
exports.getEnabledDexes = getEnabledDexes;
exports.getDexRouter = getDexRouter;
exports.getDexFee = getDexFee;
exports.DEX_CONFIG = {
    UNISWAP_V2: {
        name: "Uniswap V2",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        fee: 0.003, // 0.3%
        version: "v2",
        enabled: true
    },
    UNISWAP_V3: {
        name: "Uniswap V3",
        router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
        fee: 0.003, // Default fee tier
        version: "v3",
        feeTiers: [500, 3000, 10000], // 0.05%, 0.3%, 1%
        enabled: true
    },
    SUSHISWAP: {
        name: "SushiSwap",
        router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
        factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
        fee: 0.003, // 0.3%
        version: "v2",
        enabled: true
    },
    BALANCER: {
        name: "Balancer",
        router: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Placeholder
        factory: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
        fee: 0.003, // Variable fees
        version: "v2",
        enabled: false // Disabled for MVP
    },
    CURVE: {
        name: "Curve",
        router: "0x99a58482BD75cbab83b27EC03CA68fF489b5788f", // Placeholder
        factory: "0xB9fc157394Af804a3578134A6585C0dc9cc990d4",
        fee: 0.0004, // 0.04% typical
        version: "v2",
        enabled: false // Disabled for MVP
    }
};
exports.ENABLED_DEXES = Object.entries(exports.DEX_CONFIG)
    .filter(([_, config]) => config.enabled)
    .map(([key, config]) => ({ key, ...config }));
function getDexConfig(dexName) {
    const config = exports.DEX_CONFIG[dexName];
    if (!config) {
        throw new Error(`DEX ${dexName} not found in configuration`);
    }
    return config;
}
function getEnabledDexes() {
    return exports.ENABLED_DEXES;
}
function getDexRouter(dexName) {
    return getDexConfig(dexName).router;
}
function getDexFee(dexName) {
    return getDexConfig(dexName).fee;
}
//# sourceMappingURL=dexes.js.map