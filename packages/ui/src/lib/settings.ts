import { z } from 'zod';

export const settingsSchema = z.object({
  minProfit: z.number().min(0).max(10),
  maxGas: z.number().min(1).max(500),
  slippage: z.number().min(0.05).max(5),
  riskLevel: z.enum(['low', 'medium', 'high']),
  autoTrade: z.boolean(),
  preferredChains: z.array(z.string()),
  txConfirmations: z.number().min(1).max(12),
  notifications: z.boolean(),
  emailAlerts: z.boolean(),
  discordAlerts: z.boolean(),
  rpcUrl: z.string(),
  privateRelay: z.string(),
  wcProjectId: z.string(),
  mevProtection: z.boolean(),
  flashloanMax: z.number().min(1).max(100),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  minProfit: 0.01,
  maxGas: 50,
  slippage: 0.5,
  riskLevel: 'medium',
  autoTrade: false,
  preferredChains: ['Ethereum', 'Arbitrum'],
  txConfirmations: 1,
  notifications: true,
  emailAlerts: false,
  discordAlerts: false,
  rpcUrl: '',
  privateRelay: '',
  wcProjectId: '',
  mevProtection: true,
  flashloanMax: 10,
};
