import express, { Request, Response, Router } from 'express';
import { checkRpcHealth, redactRpcUrl } from '../utils/rpc';

const router: Router = express.Router();

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
  // rpcHost, never rpcUrl. This endpoint is public and unauthenticated, and
  // provider URLs embed the API key in the path or query string -- returning
  // them published every key to any caller. Renamed rather than redacted in
  // place so a client cannot silently keep depending on a full URL.
  const details: Record<string, { status: string; rpcHost: string | null; latencyMs?: number; error?: string }> = {};

  for (const result of checks) {
    health[result.chain] = result.status;
    details[result.chain] = {
      status: result.status,
      rpcHost: redactRpcUrl(result.rpcUrl),
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
      ...(result.error ? { error: result.error } : {}),
    };
  }

  const ok = checks.every((result) => result.status === 'healthy');
  return res.status(ok ? 200 : 503).json({ ok, health, details });
});

export default router;
