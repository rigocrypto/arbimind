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

/**
 * Per-setting applied-status metadata.
 *
 * Each key corresponds to a setting and indicates whether the **engine / bot**
 * actively reads and enforces that value at runtime.
 *
 * `true`  = the bot fetches this from the settings store and uses it in its
 *           scan / execution / alerting pipeline.
 * `false` = the value is persisted but not yet consumed — the frontend shows
 *           "Saved — not yet wired" accordingly.
 */
export interface AppliedMeta {
  /* --- Core engine (PR 1A) --- */
  autoTrade: boolean;
  minProfitEth: boolean;
  maxGasGwei: boolean;
  preferredChains: boolean;

  /* --- Advanced engine (PR 1B — not yet) --- */
  slippagePct: boolean;
  riskLevel: boolean;
  requiredConfirmations: boolean;
  flashloanMaxEth: boolean;
  mevProtection: boolean;

  /* --- Notifications --- */
  browserNotifications: boolean;
  emailAlerts: boolean;
  discordAlerts: boolean;

  /* --- Infrastructure / WalletConnect --- */
  primaryRpcUrl: boolean;
  privateRelayUrl: boolean;
  walletConnectProjectId: boolean;
}

/** Current applied status — updated as engine integration PRs land. */
export const APPLIED_META: AppliedMeta = {
  /* Core engine — wired in this PR */
  autoTrade: true,
  minProfitEth: true,
  maxGasGwei: true,
  preferredChains: false, // bot is single-chain (EVM_CHAIN env); multi-chain not yet supported

  /* Advanced engine — not yet consumed */
  slippagePct: true,    // PR 1B: replaces hardcoded 0.5% in ExecutionService swap paths
  riskLevel: false,     // no risk-based filtering / scanner breadth system exists
  requiredConfirmations: true,  // PR 1B: passed to ethers tx.wait(confirms)
  flashloanMaxEth: false,       // AI scoring only — no flashloan execution path
  mevProtection: false,         // config field exists but no relay submission client

  /* Notifications — not yet consumed */
  browserNotifications: false,
  emailAlerts: false,
  discordAlerts: false,

  /* Infrastructure — not yet consumed */
  primaryRpcUrl: false,
  privateRelayUrl: false,
  walletConnectProjectId: false,
};
