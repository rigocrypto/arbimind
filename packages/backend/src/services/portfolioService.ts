/**
 * Portfolio service: EVM + Solana deposit detection and analytics.
 * Non-custodial MVP: attribute deposits by wallet address from on-chain txs.
 */

import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import { getPricesUsd } from './priceService';
import { resolveRpcUrl } from '../utils/rpc';

// --- Types ---
export type PortfolioChain = 'evm' | 'solana';

export interface PortfolioSummary {
  chain: PortfolioChain;
  userAddress: string;
  arbAddress: string;
  totals: {
    depositedUsd?: number;
    withdrawnUsd?: number;
    feesUsd?: number;
    pnlUsd?: number;
    roiPct?: number;
    /** Current arb account value in USD (sum of balances). For charts/headers. */
    equityUsd?: number;
  };
  balances: Array<{ symbol: string; amount: string; usd?: number }>;
  deposits: Array<{ tx: string; ts: number; symbol: string; amount: string; usd?: number }>;
  withdrawals: Array<{ tx: string; ts: number; symbol: string; amount: string; usd?: number }>;
  updatedAt: number;
}

export interface TimeseriesPoint {
  ts: number;
  equityUsd?: number;
  pnlUsd?: number;
  depositsUsd?: number;
  withdrawalsUsd?: number;
  drawdownPct?: number;
}

export interface TimeseriesResponse {
  points: TimeseriesPoint[];
  /** Indicates equity/PnL/drawdown are approximated via linear ramp to current equity */
  method: 'estimated_linear_ramp_to_current_equity';
}

/** Normalize ts to ms; if in seconds (< 10e9) convert */
function toMs(ts: number): number {
  return ts < 10_000_000_000 ? ts * 1000 : ts;
}

// --- Simple in-memory cache ---
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 30_000;
const CACHE_TTL_NATIVE_MS = 90_000; // Longer for Alchemy-heavy EVM native scan
const EVM_LOG_CHUNK_BLOCKS = Math.max(1, parseInt(process.env.EVM_LOG_CHUNK_BLOCKS || '900', 10) || 900);

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs: number = CACHE_TTL_MS): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

// --- In-flight request coalescing ---
// Prevents concurrent requests for the same wallet from spawning parallel scans.
// First caller creates the promise; subsequent callers reuse it until it settles.
const inFlight = new Map<string, Promise<PortfolioSummary | null>>();

function coalesce<T extends PortfolioSummary | null>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    console.log(`[PORTFOLIO_SCAN_COALESCED] ${key}`);
    return existing as Promise<T>;
  }
  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

const MIN_CHUNK_SIZE = 10;
const MAX_RETRIES_PER_CHUNK = 3;
const MAX_CONSECUTIVE_FAILURES = 5;
const RETRY_DELAY_MS = 500;

async function queryFilterChunked(
  contract: ethers.Contract,
  filter: unknown,
  fromBlock: number,
  toBlock: number,
  chunkSize: number = EVM_LOG_CHUNK_BLOCKS
): Promise<ethers.EventLog[]> {
  const events: ethers.EventLog[] = [];
  let start = fromBlock;
  let currentChunk = chunkSize;
  let retriesForCurrentChunk = 0;
  let consecutiveFailures = 0;

  while (start <= toBlock) {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.warn(
        `[queryFilterChunked] ${MAX_CONSECUTIVE_FAILURES} consecutive failures — aborting. Returning ${events.length} partial results (stopped at block ${start}).`
      );
      break;
    }

    const end = Math.min(start + currentChunk - 1, toBlock);
    try {
      const chunk = (await contract.queryFilter(filter as never, start, end)) as ethers.EventLog[];
      events.push(...chunk);
      start = end + 1;
      currentChunk = chunkSize;
      retriesForCurrentChunk = 0;
      consecutiveFailures = 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRangeError =
        msg.includes('block range') || msg.includes('exceed') || msg.includes('Log response size exceeded');

      if (isRangeError) {
        retriesForCurrentChunk++;

        if (retriesForCurrentChunk > MAX_RETRIES_PER_CHUNK || currentChunk <= MIN_CHUNK_SIZE) {
          console.warn(
            `[queryFilterChunked] skipping blocks ${start}-${end} after ${retriesForCurrentChunk} retries (chunk=${currentChunk})`
          );
          consecutiveFailures++;
          start = end + 1;
          currentChunk = chunkSize;
          retriesForCurrentChunk = 0;
          continue;
        }

        const halved = Math.max(MIN_CHUNK_SIZE, Math.floor(currentChunk / 2));
        if (retriesForCurrentChunk === 1) {
          console.warn(`[queryFilterChunked] block range error at ${start}-${end}, reducing chunk to ${halved}`);
        }
        currentChunk = halved;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      // Non-recoverable error — log and skip this chunk
      console.error(`[queryFilterChunked] non-recoverable error at ${start}-${end}:`, msg);
      consecutiveFailures++;
      start = end + 1;
    }
  }

  return events;
}

// --- EVM ---
const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_BY_CHAIN: Record<number, string> = {
  1: USDC_MAINNET,
  42161: USDC_ARBITRUM,
  8453: USDC_BASE,
};

export async function getEvmPortfolio(userAddress: string): Promise<PortfolioSummary | null> {
  const arbAddress = process.env.EVM_ARB_ACCOUNT?.trim();
  if (!arbAddress || !/^0x[a-fA-F0-9]{40}$/.test(arbAddress)) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) return null;

  const cacheKey = `evm:${userAddress.toLowerCase()}`;
  const cached = getCached<PortfolioSummary>(cacheKey);
  if (cached) return cached;

  return coalesce(cacheKey, async () => {
    // Re-check cache inside coalesce — a prior coalesced call may have populated it.
    const inner = getCached<PortfolioSummary>(cacheKey);
    if (inner) return inner;

  try {
    const provider = new ethers.JsonRpcProvider(
      resolveRpcUrl('evm', [
        process.env.ALCHEMY_API_KEY?.trim()
          ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY.trim()}`
          : '',
        process.env.INFURA_PROJECT_ID?.trim()
          ? `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID.trim()}`
          : '',
        'https://eth.llamarpc.com',
      ]) ?? 'https://eth.llamarpc.com'
    );
    const chainId = (await provider.getNetwork()).chainId;

    const deposits: PortfolioSummary['deposits'] = [];
    const balances: PortfolioSummary['balances'] = [];
    let totalDepositedUsdc = 0n;

    const BLOCKS_PER_DAY = 7200; // ~12s/block
    const lookbackBlocks = 30 * BLOCKS_PER_DAY;
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - lookbackBlocks);

    const ethAbi = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
    const usdcAddress = USDC_BY_CHAIN[Number(chainId)] ?? USDC_MAINNET;

    const usdc = new ethers.Contract(usdcAddress, ethAbi, provider);
    const usdcFilter = usdc.filters?.Transfer?.(userAddress, arbAddress) ?? null;
    const usdcEvents = usdcFilter
      ? await queryFilterChunked(usdc, usdcFilter, fromBlock, currentBlock)
      : [];

    for (const ev of usdcEvents) {
      const block = await ev.getBlock();
      const eventLog = ev as { args?: unknown[]; hash?: string };
      const amount = (eventLog.args?.[2] as bigint | undefined) ?? 0n;
      totalDepositedUsdc += amount;
      deposits.push({
        tx: eventLog.hash ?? ev.transactionHash ?? '',
        ts: (block?.timestamp ?? 0) * 1000,
        symbol: 'USDC',
        amount: ethers.formatUnits(amount, 6),
      });
    }

    // Native ETH deposits (behind env flag to avoid RPC cost surprises)
    let ethDeposited = 0;
    const scanNative = process.env.PORTFOLIO_EVM_SCAN_NATIVE === 'true';
    const nativeLookbackDays = parseInt(process.env.PORTFOLIO_EVM_NATIVE_LOOKBACK_DAYS || '30', 10) || 30;
    const alchemyKey = process.env.ALCHEMY_API_KEY?.trim();
    if (scanNative && alchemyKey) {
      try {
        const rpcUrl =
          resolveRpcUrl('evm', [
            process.env.ALCHEMY_API_KEY?.trim()
              ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY.trim()}`
              : '',
            process.env.INFURA_PROJECT_ID?.trim()
              ? `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID.trim()}`
              : '',
            'https://eth.llamarpc.com',
          ]) ?? 'https://eth.llamarpc.com';
        const nativeLookbackBlocks = Math.min(lookbackBlocks, nativeLookbackDays * BLOCKS_PER_DAY);
        const fromBlockHex = `0x${Math.max(0, currentBlock - nativeLookbackBlocks).toString(16)}`;
        const body = {
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromAddress: userAddress,
            toAddress: arbAddress,
            category: ['external'],
            fromBlock: fromBlockHex,
            toBlock: 'latest',
            excludeZeroValue: true,
            withMetadata: true,
            maxCount: '0x3e8',
          }],
        };
        const r = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = (await r.json()) as { result?: { transfers?: Array<{ hash?: string; value?: number; metadata?: { blockTimestamp?: string } }> } };
        const transfers = j?.result?.transfers ?? [];
        for (const t of transfers) {
          const value = t.value ?? 0;
          if (value <= 0) continue;
          ethDeposited += value; // Alchemy returns value in ETH for external
          deposits.push({
            tx: t.hash ?? '',
            ts: t.metadata?.blockTimestamp ? new Date(t.metadata.blockTimestamp).getTime() : 0,
            symbol: 'ETH',
            amount: String(value),
          });
        }
      } catch (ethErr) {
        console.warn('EVM native ETH scan failed (non-fatal):', ethErr);
      }
    }

    const prices = await getPricesUsd(['ETH', 'USDC']);
    const ethUsd = prices.ETH ?? 0;
    const usdcUsd = prices.USDC ?? 0;
    const usdcDeposited = Number(ethers.formatUnits(totalDepositedUsdc, 6));
    const depositedUsd = ethDeposited * ethUsd + usdcDeposited * usdcUsd;

    balances.push({ symbol: 'ETH', amount: ethDeposited.toFixed(6), usd: ethDeposited * ethUsd });
    balances.push({ symbol: 'USDC', amount: usdcDeposited.toFixed(2), usd: usdcDeposited * usdcUsd });
    const equityUsd = balances.reduce((s, b) => s + (b.usd ?? 0), 0);

    const summary: PortfolioSummary = {
      chain: 'evm',
      userAddress,
      arbAddress,
      totals: {
        depositedUsd,
        withdrawnUsd: 0,
        feesUsd: 0,
        pnlUsd: equityUsd - depositedUsd,
        equityUsd,
        ...(depositedUsd > 0 ? { roiPct: ((equityUsd - depositedUsd) / depositedUsd) * 100 } : {}),
      },
      balances,
      deposits,
      withdrawals: [],
      updatedAt: Date.now(),
    };

    setCache(cacheKey, summary, scanNative && alchemyKey ? CACHE_TTL_NATIVE_MS : CACHE_TTL_MS);
    return summary;
  } catch (err) {
    console.error('EVM portfolio error:', err);

    // Keep portfolio endpoints available when upstream RPC log queries fail.
    // This avoids surfacing a hard 503 to the UI for transient provider issues.
    const fallback: PortfolioSummary = {
      chain: 'evm',
      userAddress,
      arbAddress,
      totals: {
        depositedUsd: 0,
        withdrawnUsd: 0,
        feesUsd: 0,
        pnlUsd: 0,
        equityUsd: 0,
        roiPct: 0,
      },
      balances: [],
      deposits: [],
      withdrawals: [],
      updatedAt: Date.now(),
    };

    setCache(cacheKey, fallback, 10_000);
    return fallback;
  }
  });
}

export async function getEvmTimeseries(
  userAddress: string,
  range: string
): Promise<TimeseriesResponse> {
  const summary = await getEvmPortfolio(userAddress);
  if (!summary) return { points: [], method: 'estimated_linear_ramp_to_current_equity' };
  const prices = await getPricesUsd(['ETH', 'USDC']);
  const ethUsd = prices.ETH ?? 0;
  const usdcUsd = prices.USDC ?? 0;
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const points: TimeseriesPoint[] = [];
  const now = Date.now();
  const totalPnl = summary.totals.pnlUsd ?? 0;
  const totalDeposited = summary.totals.depositedUsd ?? 0;

  const dailyDeposits = new Map<number, number>();
  for (const d of summary.deposits) {
    const tsMs = toMs(d.ts);
    const dayStart = Math.floor(tsMs / 86400000) * 86400000;
    const amt = d.symbol === 'ETH' ? Number(d.amount) * ethUsd : Number(d.amount) * usdcUsd;
    dailyDeposits.set(dayStart, (dailyDeposits.get(dayStart) ?? 0) + amt);
  }

  let cumDepositedUsd = 0;
  let peak = 0;
  const firstDayTs = Math.floor((now - days * 86400000) / 86400000) * 86400000;
  const lastDayTs = Math.floor(now / 86400000) * 86400000;
  const totalDaysSpan = Math.max(1, (lastDayTs - firstDayTs) / 86400000);

  for (let i = days; i >= 0; i--) {
    const ts = Math.floor((now - i * 86400000) / 86400000) * 86400000;
    const depositsUsd = dailyDeposits.get(ts) ?? 0;
    cumDepositedUsd += depositsUsd;
    const daysFromStart = Math.max(0, (ts - firstDayTs) / 86400000);
    const timeWeight = totalDeposited > 0 ? Math.min(1, daysFromStart / totalDaysSpan) : 0;
    const equityUsd = cumDepositedUsd + totalPnl * timeWeight;
    peak = Math.max(peak, equityUsd);
    const drawdownPct = peak > 0 ? ((peak - equityUsd) / peak) * 100 : 0;
    points.push({
      ts,
      equityUsd,
      pnlUsd: equityUsd - cumDepositedUsd,
      ...(depositsUsd ? { depositsUsd } : {}),
      drawdownPct,
    });
  }
  const lastIdx = points.length - 1;
  const currentEquity = summary.totals.equityUsd ?? points[lastIdx]?.equityUsd ?? 0;
  if (lastIdx >= 0 && currentEquity !== undefined) {
    points[lastIdx] = {
      ...points[lastIdx]!,
      equityUsd: currentEquity,
      pnlUsd: currentEquity - cumDepositedUsd,
    };
  }
  return { points, method: 'estimated_linear_ramp_to_current_equity' };
}

// --- Solana ---
const LAMPORTS_PER_SOL = 1e9;

export async function getSolanaPortfolio(userPubkey: string): Promise<PortfolioSummary | null> {
  const arbAddress = process.env.SOLANA_ARB_ACCOUNT?.trim();
  const _feeWallet = process.env.SOLANA_FEE_WALLET?.trim();
  if (!arbAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(arbAddress)) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(userPubkey)) return null;

  const cacheKey = `solana:${userPubkey}`;
  const cached = getCached<PortfolioSummary>(cacheKey);
  if (cached) return cached;

  return coalesce(cacheKey, async () => {
    // Re-check cache inside coalesce — a prior coalesced call may have populated it.
    const inner = getCached<PortfolioSummary>(cacheKey);
    if (inner) return inner;

    try {
    const cluster = process.env.SOLANA_CLUSTER || 'devnet';
    const solanaFallback =
      cluster === 'mainnet-beta'
        ? 'https://api.mainnet-beta.solana.com'
        : cluster === 'testnet'
          ? 'https://api.testnet.solana.com'
          : 'https://api.devnet.solana.com';

    const connection = new Connection(resolveRpcUrl('solana', [solanaFallback]) ?? solanaFallback);
    const arbPubkey = new PublicKey(arbAddress);
    const _userKey = new PublicKey(userPubkey);

    const deposits: PortfolioSummary['deposits'] = [];
    let totalDepositedSol = 0;

    const sigs = await connection.getSignaturesForAddress(arbPubkey, { limit: 100 });
    const allInstructionsWithIndex = (
      tx: { transaction?: { message?: { instructions?: unknown[] } }; meta?: { innerInstructions?: { instructions: unknown[] }[] } | null }
    ) => {
      let idx = 0;
      const main = (tx.transaction?.message?.instructions ?? []).map((ix) => ({ ix, instructionIndex: idx++, innerIndex: -1 }));
      const inner =
        (tx.meta as { innerInstructions?: { instructions: unknown[] }[] } | null)?.innerInstructions?.flatMap((outer, _outerIdx) =>
          (outer.instructions ?? []).map((ix, innerIdx) => ({ ix, instructionIndex: idx++, innerIndex: innerIdx }))
        ) ?? [];
      return [...main, ...inner];
    };

    const seen = new Set<string>();
    const dedupeKey = (sig: string, ixIdx: number, innerIdx: number, lamports: number, from: string, to: string) =>
      `${sig}:${ixIdx}:${innerIdx}:${lamports}:${from}:${to}`;

    for (const s of sigs) {
      try {
        const tx = await connection.getParsedTransaction(s.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx) continue;
        const accountKeys = (tx.transaction?.message as { accountKeys?: { toBase58?: () => string; pubkey?: { toBase58?: () => string } }[] })?.accountKeys ?? [];
        const resolveAccount = (val: string | number | undefined): string | null => {
          if (val == null) return null;
          if (typeof val === 'string' && val.length > 30) return val;
          const idx = typeof val === 'number' ? val : parseInt(String(val), 10);
          if (isNaN(idx) || idx < 0 || idx >= accountKeys.length) return null;
          const k = accountKeys[idx];
          return typeof k === 'object' && k ? (k.pubkey?.toBase58?.() ?? k.toBase58?.() ?? null) : null;
        };

        for (const { ix, instructionIndex, innerIndex = -1 } of allInstructionsWithIndex(tx as Parameters<typeof allInstructionsWithIndex>[0])) {
          const parsed = (ix as { parsed?: { type?: string; info?: { lamports?: number; source?: string | number; destination?: string | number } } }).parsed;
          if (!parsed) continue;
          if (parsed.type !== 'transfer' && parsed.type !== 'transferChecked') continue;
          const info = parsed.info;
          const source = resolveAccount(info?.source) ?? (typeof info?.source === 'string' ? info.source : null);
          const dest = resolveAccount(info?.destination) ?? (typeof info?.destination === 'string' ? info.destination : null);
          const lamports = info?.lamports ?? 0;
          if (!source || !dest || lamports <= 0) continue;
          if (source !== userPubkey || dest !== arbAddress) continue;

          const key = dedupeKey(s.signature, instructionIndex, innerIndex, lamports, source, dest);
          if (seen.has(key)) continue;
          seen.add(key);

          totalDepositedSol += lamports / LAMPORTS_PER_SOL;
          deposits.push({
            tx: s.signature,
            ts: (tx.blockTime ?? 0) * 1000,
            symbol: 'SOL',
            amount: (lamports / LAMPORTS_PER_SOL).toFixed(6),
          });
        }
      } catch {
        // skip failed parse
      }
    }

    let arbBalanceSol = 0;
    try {
      const bal = await connection.getBalance(arbPubkey);
      arbBalanceSol = bal / LAMPORTS_PER_SOL;
    } catch {
      // ignore
    }

    const prices = await getPricesUsd(['SOL']);
    const solUsd = prices.SOL ?? 0;
    const depositedUsd = totalDepositedSol * solUsd;
    const balanceUsd = arbBalanceSol * solUsd;
    const pnlUsd = balanceUsd - depositedUsd;
    const roiPct = depositedUsd > 0 ? (pnlUsd / depositedUsd) * 100 : undefined;

    const summary: PortfolioSummary = {
      chain: 'solana',
      userAddress: userPubkey,
      arbAddress,
      totals: {
        depositedUsd,
        withdrawnUsd: 0,
        feesUsd: 0,
        pnlUsd,
        equityUsd: balanceUsd,
        ...(roiPct !== undefined ? { roiPct } : {}),
      },
      balances: [
        { symbol: 'SOL', amount: arbBalanceSol.toFixed(6), usd: balanceUsd },
      ],
      deposits: deposits.sort((a, b) => b.ts - a.ts).slice(0, 20),
      withdrawals: [],
      updatedAt: Date.now(),
    };

    setCache(cacheKey, summary);
    return summary;
  } catch (err) {
    console.error('Solana portfolio error:', err);
    return null;
  }
  });
}

export async function getSolanaTimeseries(
  userPubkey: string,
  range: string
): Promise<TimeseriesResponse> {
  const summary = await getSolanaPortfolio(userPubkey);
  if (!summary) return { points: [], method: 'estimated_linear_ramp_to_current_equity' };
  const prices = await getPricesUsd(['SOL']);
  const solUsd = prices.SOL ?? 0;
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const points: TimeseriesPoint[] = [];
  const now = Date.now();
  const totalPnl = summary.totals.pnlUsd ?? 0;
  const totalDeposited = summary.totals.depositedUsd ?? 0;

  const dailyDeposits = new Map<number, number>();
  for (const d of summary.deposits) {
    const tsMs = toMs(d.ts);
    const dayStart = Math.floor(tsMs / 86400000) * 86400000;
    const amt = Number(d.amount) * solUsd;
    dailyDeposits.set(dayStart, (dailyDeposits.get(dayStart) ?? 0) + amt);
  }

  let cumDepositedUsd = 0;
  let peak = 0;
  const firstDayTs = Math.floor((now - days * 86400000) / 86400000) * 86400000;
  const lastDayTs = Math.floor(now / 86400000) * 86400000;
  const totalDaysSpan = Math.max(1, (lastDayTs - firstDayTs) / 86400000);

  for (let i = days; i >= 0; i--) {
    const ts = Math.floor((now - i * 86400000) / 86400000) * 86400000;
    const depositsUsd = dailyDeposits.get(ts) ?? 0;
    cumDepositedUsd += depositsUsd;
    const daysFromStart = Math.max(0, (ts - firstDayTs) / 86400000);
    const timeWeight = totalDeposited > 0 ? Math.min(1, daysFromStart / totalDaysSpan) : 0;
    const equityUsd = cumDepositedUsd + totalPnl * timeWeight;
    peak = Math.max(peak, equityUsd);
    const drawdownPct = peak > 0 ? ((peak - equityUsd) / peak) * 100 : 0;
    points.push({
      ts,
      equityUsd,
      pnlUsd: equityUsd - cumDepositedUsd,
      ...(depositsUsd ? { depositsUsd } : {}),
      drawdownPct,
    });
  }
  const lastIdx = points.length - 1;
  const currentEquity = summary.totals.equityUsd ?? points[lastIdx]?.equityUsd ?? 0;
  if (lastIdx >= 0 && currentEquity !== undefined) {
    points[lastIdx] = {
      ...points[lastIdx]!,
      equityUsd: currentEquity,
      pnlUsd: currentEquity - cumDepositedUsd,
    };
  }
  return { points, method: 'estimated_linear_ramp_to_current_equity' };
}

/** @internal Test helper — clear in-flight map and cache. */
export function _resetPortfolioState(): void {
  inFlight.clear();
  cache.clear();
}
