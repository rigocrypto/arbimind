export interface DexConfig {
  name: string;
  router: string;
  factory: string;
  quoter?: string;
  fee: number;
  version: 'v2' | 'v3';
  feeTiers?: number[];
  enabled: boolean;
}

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

function isEthereumSepoliaProfile(): boolean {
  const network = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase();
  const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
  return network === 'testnet' && evmChain === 'ethereum';
}

function boolFromEnv(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = normalizeEnvValue(value).toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function buildSepoliaDexConfig(): Record<string, DexConfig> {
  const v2Router = normalizeEnvValue(process.env['SEPOLIA_UNISWAP_V2_ROUTER']);
  const v2Factory = normalizeEnvValue(process.env['SEPOLIA_UNISWAP_V2_FACTORY']);

  const v3Router = normalizeEnvValue(process.env['SEPOLIA_UNISWAP_V3_ROUTER']);
  const v3Factory = normalizeEnvValue(process.env['SEPOLIA_UNISWAP_V3_FACTORY']);
  const v3Quoter = normalizeEnvValue(process.env['SEPOLIA_UNISWAP_V3_QUOTER']);

  const sushiRouter = normalizeEnvValue(process.env['SEPOLIA_SUSHISWAP_ROUTER']);
  const sushiFactory = normalizeEnvValue(process.env['SEPOLIA_SUSHISWAP_FACTORY']);

  return {
    UNISWAP_V2: {
      name: 'Uniswap V2 (Sepolia)',
      router: v2Router,
      factory: v2Factory,
      fee: 0.003,
      version: 'v2',
      enabled: Boolean(v2Router && v2Factory) && boolFromEnv(process.env['SEPOLIA_UNISWAP_V2_ENABLED'], true),
    },
    UNISWAP_V3: {
      name: 'Uniswap V3 (Sepolia)',
      router: v3Router,
      factory: v3Factory,
      quoter: v3Quoter || undefined,
      fee: 0.003,
      version: 'v3',
      feeTiers: [500, 3000, 10000],
      enabled: Boolean(v3Router && v3Factory) && boolFromEnv(process.env['SEPOLIA_UNISWAP_V3_ENABLED'], true),
    },
    SUSHISWAP: {
      name: 'SushiSwap (Sepolia)',
      router: sushiRouter,
      factory: sushiFactory,
      fee: 0.003,
      version: 'v2',
      enabled: Boolean(sushiRouter && sushiFactory) && boolFromEnv(process.env['SEPOLIA_SUSHISWAP_ENABLED'], false),
    },
    BALANCER: {
      name: 'Balancer',
      router: '',
      factory: '',
      fee: 0.003,
      version: 'v2',
      enabled: false,
    },
    CURVE: {
      name: 'Curve',
      router: '',
      factory: '',
      fee: 0.0004,
      version: 'v2',
      enabled: false,
    },
  };
}

const DEFAULT_DEX_CONFIG: Record<string, DexConfig> = {
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

export const DEX_CONFIG: Record<string, DexConfig> =
  isEthereumSepoliaProfile() ? buildSepoliaDexConfig() : DEFAULT_DEX_CONFIG;

export const ENABLED_DEXES = Object.entries(DEX_CONFIG)
  .filter(([_, config]) => config.enabled)
  .map(([key, config]) => ({ key, ...config }));

export function getDexConfig(dexName: string): DexConfig {
  const config = DEX_CONFIG[dexName];
  if (!config) {
    throw new Error(`DEX ${dexName} not found in configuration`);
  }
  return config;
}

export function getEnabledDexes(): DexConfig[] {
  return ENABLED_DEXES;
}

export function getDexRouter(dexName: string): string {
  return getDexConfig(dexName).router;
}

export function getDexFee(dexName: string): number {
  return getDexConfig(dexName).fee;
}
