import express, { Request, Response } from 'express';
import {
  getEvmPortfolio,
  getEvmTimeseries,
  getSolanaPortfolio,
  getSolanaTimeseries,
} from '../services/portfolioService';
import { touchUser, getSnapshots, isDbAvailable } from '../db/portfolioDb';
import type { TimeseriesPoint } from '../services/portfolioService';

const router = express.Router();

type PortfolioEnvDiag = {
  error: string;
  reason: string;
  fix: string;
};

type PortfolioFallbackDiag = {
  error: string;
  reason: string;
  fix: string;
};

function getEvmEnvDiagnostic(): PortfolioEnvDiag | null {
  const arbAccount = process.env.EVM_ARB_ACCOUNT?.trim();
  if (!arbAccount) {
    return {
      error: 'Portfolio unavailable',
      reason: 'EVM_ARB_ACCOUNT env missing',
      fix: 'Set EVM_ARB_ACCOUNT=0xYourWallet in Railway Variables',
    };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(arbAccount)) {
    return {
      error: 'Portfolio unavailable',
      reason: 'EVM_ARB_ACCOUNT format invalid',
      fix: 'Set EVM_ARB_ACCOUNT to a valid 0x-prefixed 40-hex EVM address in Railway Variables',
    };
  }
  return null;
}

function getSolanaEnvDiagnostic(): PortfolioEnvDiag | null {
  const arbAccount = process.env.SOLANA_ARB_ACCOUNT?.trim();
  if (!arbAccount) {
    return {
      error: 'Portfolio unavailable',
      reason: 'SOLANA_ARB_ACCOUNT env missing',
      fix: 'Set SOLANA_ARB_ACCOUNT=YourBase58Wallet in Railway Variables',
    };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(arbAccount)) {
    return {
      error: 'Portfolio unavailable',
      reason: 'SOLANA_ARB_ACCOUNT format invalid',
      fix: 'Set SOLANA_ARB_ACCOUNT to a valid Base58 Solana public key in Railway Variables',
    };
  }
  return null;
}

function getPortfolioFallbackDiagnostic(reason: string, fix: string): PortfolioFallbackDiag {
  return {
    error: 'Portfolio unavailable',
    reason,
    fix,
  };
}

function getErrorReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

function computeDrawdown(points: TimeseriesPoint[]): TimeseriesPoint[] {
  let peak = 0;
  return points.map((p) => {
    const eq = p.equityUsd ?? 0;
    peak = Math.max(peak, eq);
    const drawdownPct = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    return { ...p, drawdownPct };
  });
}

/** GET /api/portfolio/evm?address=0x... */
router.get('/evm', async (req: Request, res: Response) => {
  const envDiag = getEvmEnvDiagnostic();
  if (envDiag) {
    console.info(`Portfolio query skipped: ${envDiag.reason}`);
    return res.status(503).json(envDiag);
  }

  const address = (req.query.address as string)?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Valid EVM address required' });
  }
  try {
    const summary = await getEvmPortfolio(address);
    if (!summary) {
      const diag = getPortfolioFallbackDiagnostic(
        'Query failed',
        'Check RPC/indexer connectivity and backend logs/Sentry'
      );
      console.info(`Portfolio fallback: ${diag.reason} (chain=evm)`);
      return res.status(503).json(diag);
    }
    if ((summary.totals.equityUsd ?? 0) <= 0) {
      const diag = getPortfolioFallbackDiagnostic(
        'Zero balances/TVL',
        'Fund arb account or verify tracked deposits and RPC/indexer freshness'
      );
      console.info(`Portfolio fallback: ${diag.reason} (chain=evm)`);
      return res.status(503).json(diag);
    }
    touchUser('evm', address);
    return res.json(summary);
  } catch (err) {
    const reason = getErrorReason(err);
    console.error('Portfolio EVM error:', err);
    return res.status(503).json(
      getPortfolioFallbackDiagnostic(reason, 'Check backend logs/Sentry and RPC/indexer status')
    );
  }
});

/** GET /api/portfolio/evm/timeseries?address=0x...&range=30d */
router.get('/evm/timeseries', async (req: Request, res: Response) => {
  const envDiag = getEvmEnvDiagnostic();
  if (envDiag) {
    console.info(`Portfolio query skipped: ${envDiag.reason}`);
    return res.status(503).json(envDiag);
  }

  const address = (req.query.address as string)?.trim();
  const range = ((req.query.range as string) || '30d').trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Valid EVM address required' });
  }
  try {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const now = Date.now();
    const fromDayTs = Math.floor((now - days * 86400000) / 86400000) * 86400000;
    const toDayTs = Math.floor(now / 86400000) * 86400000;

    if (isDbAvailable()) {
      const snapshots = await getSnapshots('evm', address, fromDayTs, toDayTs);
      if (snapshots && snapshots.length >= 2) {
        const points = computeDrawdown(snapshots);
        return res.json({ points, method: 'snapshotted_daily_equity' as const });
      }
    }

    const result = await getEvmTimeseries(address, range);
    if (!result.points.length) {
      const diag = getPortfolioFallbackDiagnostic(
        'No timeseries data',
        'Fund arb account, run snapshots, or verify RPC/indexer connectivity'
      );
      console.info(`Portfolio fallback: ${diag.reason} (chain=evm, range=${range})`);
      return res.status(503).json(diag);
    }
    return res.json(result);
  } catch (err) {
    const reason = getErrorReason(err);
    console.error('Portfolio EVM timeseries error:', err);
    return res.status(503).json(
      getPortfolioFallbackDiagnostic(reason, 'Check backend logs/Sentry and RPC/indexer status')
    );
  }
});

/** GET /api/portfolio/solana?address=BASE58 */
router.get('/solana', async (req: Request, res: Response) => {
  const envDiag = getSolanaEnvDiagnostic();
  if (envDiag) {
    console.info(`Portfolio query skipped: ${envDiag.reason}`);
    return res.status(503).json(envDiag);
  }

  const address = (req.query.address as string)?.trim();
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return res.status(400).json({ error: 'Valid Solana address required' });
  }
  try {
    const summary = await getSolanaPortfolio(address);
    if (!summary) {
      const diag = getPortfolioFallbackDiagnostic(
        'Query failed',
        'Check RPC/indexer connectivity and backend logs/Sentry'
      );
      console.info(`Portfolio fallback: ${diag.reason} (chain=solana)`);
      return res.status(503).json(diag);
    }
    if ((summary.totals.equityUsd ?? 0) <= 0) {
      const diag = getPortfolioFallbackDiagnostic(
        'Zero balances/TVL',
        'Fund arb account or verify tracked deposits and RPC/indexer freshness'
      );
      console.info(`Portfolio fallback: ${diag.reason} (chain=solana)`);
      return res.status(503).json(diag);
    }
    touchUser('solana', address);
    return res.json(summary);
  } catch (err) {
    const reason = getErrorReason(err);
    console.error('Portfolio Solana error:', err);
    return res.status(503).json(
      getPortfolioFallbackDiagnostic(reason, 'Check backend logs/Sentry and RPC/indexer status')
    );
  }
});

/** GET /api/portfolio/solana/timeseries?address=BASE58&range=30d */
router.get('/solana/timeseries', async (req: Request, res: Response) => {
  const envDiag = getSolanaEnvDiagnostic();
  if (envDiag) {
    console.info(`Portfolio query skipped: ${envDiag.reason}`);
    return res.status(503).json(envDiag);
  }

  const address = (req.query.address as string)?.trim();
  const range = ((req.query.range as string) || '30d').trim();
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return res.status(400).json({ error: 'Valid Solana address required' });
  }
  try {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const now = Date.now();
    const fromDayTs = Math.floor((now - days * 86400000) / 86400000) * 86400000;
    const toDayTs = Math.floor(now / 86400000) * 86400000;

    if (isDbAvailable()) {
      const snapshots = await getSnapshots('solana', address, fromDayTs, toDayTs);
      if (snapshots && snapshots.length >= 2) {
        const points = computeDrawdown(snapshots);
        return res.json({ points, method: 'snapshotted_daily_equity' as const });
      }
    }

    const result = await getSolanaTimeseries(address, range);
    if (!result.points.length) {
      const diag = getPortfolioFallbackDiagnostic(
        'No timeseries data',
        'Fund arb account, run snapshots, or verify RPC/indexer connectivity'
      );
      console.info(`Portfolio fallback: ${diag.reason} (chain=solana, range=${range})`);
      return res.status(503).json(diag);
    }
    return res.json(result);
  } catch (err) {
    const reason = getErrorReason(err);
    console.error('Portfolio Solana timeseries error:', err);
    return res.status(503).json(
      getPortfolioFallbackDiagnostic(reason, 'Check backend logs/Sentry and RPC/indexer status')
    );
  }
});

export default router;
