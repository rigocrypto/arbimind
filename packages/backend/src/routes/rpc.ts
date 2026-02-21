import express, { Request, Response } from 'express';
import { checkRpcHealth } from '../utils/rpc';

const router = express.Router();

/**
 * GET /api/rpc/health?chain=evm|solana|worldchain_sepolia (comma-separated allowed)
 * Returns RPC connectivity/health for requested chains.
 */
router.get('/health', async (req: Request, res: Response) => {
  const raw = (req.query.chain as string | undefined)?.trim();
  const chains = (raw ? raw.split(',') : ['evm', 'solana', 'worldchain_sepolia'])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (chains.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'chain required: evm | solana | worldchain_sepolia (comma-separated allowed)',
    });
  }

  const checks = await Promise.all(chains.map((chain) => checkRpcHealth(chain)));
  const health: Record<string, string> = {};
  const details: Record<string, { status: string; rpcUrl: string | null; error?: string }> = {};

  for (const result of checks) {
    health[result.chain] = result.status;
    details[result.chain] = {
      status: result.status,
      rpcUrl: result.rpcUrl,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  const ok = checks.every((result) => result.status === 'healthy');
  return res.status(ok ? 200 : 503).json({ ok, health, details });
});

export default router;
