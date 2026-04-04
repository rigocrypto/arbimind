import Joi from 'joi';

/* ------------------------------------------------------------------ */
/*  Engine-level settings — persisted in Postgres, served via API     */
/* ------------------------------------------------------------------ */

export interface EngineSettings {
  autoTrade: boolean;
  minProfitEth: number;
  maxGasGwei: number;
  slippagePct: number;
  riskLevel: 'low' | 'medium' | 'high';
  preferredChains: string[];
  requiredConfirmations: number;
  flashloanMaxEth: number;
  mevProtection: boolean;
  browserNotifications: boolean;
  emailAlerts: boolean;
  discordAlerts: boolean;
  discordWebhookUrl: string | null;
  primaryRpcUrl: string | null;
  privateRelayUrl: string | null;
  walletConnectProjectId: string | null;
  updatedAt: string;
}

export const VALID_CHAINS = [
  'ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'solana',
] as const;

export const DEFAULT_ENGINE_SETTINGS: Omit<EngineSettings, 'updatedAt'> = {
  autoTrade: false,
  minProfitEth: 0.01,
  maxGasGwei: 50,
  slippagePct: 0.5,
  riskLevel: 'medium',
  preferredChains: ['ethereum', 'arbitrum'],
  requiredConfirmations: 1,
  flashloanMaxEth: 10,
  mevProtection: true,
  browserNotifications: false,
  emailAlerts: false,
  discordAlerts: false,
  discordWebhookUrl: null,
  primaryRpcUrl: null,
  privateRelayUrl: null,
  walletConnectProjectId: null,
};

export const engineSettingsSchema = Joi.object<EngineSettings>({
  autoTrade: Joi.boolean(),
  minProfitEth: Joi.number().min(0).max(10),
  maxGasGwei: Joi.number().min(1).max(500),
  slippagePct: Joi.number().min(0).max(5),
  riskLevel: Joi.string().valid('low', 'medium', 'high'),
  preferredChains: Joi.array().items(
    Joi.string().valid(...VALID_CHAINS),
  ).min(1),
  requiredConfirmations: Joi.number().integer().min(1).max(20),
  flashloanMaxEth: Joi.number().min(0).max(100),
  mevProtection: Joi.boolean(),
  browserNotifications: Joi.boolean(),
  emailAlerts: Joi.boolean(),
  discordAlerts: Joi.boolean(),
  discordWebhookUrl: Joi.string().uri({ scheme: ['https'] }).allow(null),
  primaryRpcUrl: Joi.string().uri({ scheme: ['http', 'https', 'wss', 'ws'] }).allow(null, ''),
  privateRelayUrl: Joi.string().uri({ scheme: ['https'] }).allow(null, ''),
  walletConnectProjectId: Joi.string().max(100).allow(null, ''),
}).options({ stripUnknown: true });

/** Applied-status metadata: which subsystems actually consume settings. */
export interface AppliedMeta {
  engine: boolean;
  scanner: boolean;
  notifications: boolean;
  walletconnect: boolean;
}

/** Current applied status — updated as engine integration PRs land. */
export const APPLIED_META: AppliedMeta = {
  engine: false,
  scanner: false,
  notifications: false,
  walletconnect: false,
};
