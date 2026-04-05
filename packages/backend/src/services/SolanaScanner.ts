/**
 * Solana Devnet Arbitrage Scanner
 * Polls Jupiter V6 API for quotes, detects spread opportunities between pairs.
 * Emits results to an in-memory queue. DEVNET ONLY.
 */

const JUPITER_API_BASE =
  process.env.SOLANA_JUPITER_DEVNET_API_BASE?.trim() || 'https://quote-api.jup.ag/v6';

/** Devnet-compatible token mints */
export const DEVNET_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
};

/** Token decimal places — critical for correct PnL math */
export const DEVNET_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  RAY: 6,
  JUP: 6,
  ORCA: 6,
};

export const SCAN_PAIRS = [
  { a: 'SOL', b: 'USDC' },
  { a: 'SOL', b: 'USDT' },
  { a: 'SOL', b: 'RAY' },
  { a: 'SOL', b: 'ORCA' },
  { a: 'USDC', b: 'USDT' },
  { a: 'RAY', b: 'USDC' },
];

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: unknown[];
}

export interface ArbitrageOpportunity {
  id: string;
  pair: string;
  spreadBps: number;
  expectedProfitSol: number;
  route: string;
  forwardQuote: JupiterQuote;
  reverseQuote: JupiterQuote;
  confidence: 'high' | 'medium' | 'low';
  detectedAt: number;
  status: 'detected' | 'executing' | 'completed' | 'skipped';
  result?: {
    mode: 'paper' | 'live';
    pnlSol: number;
    gasSol: number;
    txSignature?: string;
    error?: string;
  };
}

export interface ScannerStatus {
  running: boolean;
  pairsScanned: number;
  opportunitiesFound: number;
  lastScanDurationMs: number;
  lastScanAt: number;
  totalScans: number;
}

export type LogEntry = {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let running = false;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
const opportunityQueue: ArbitrageOpportunity[] = [];
const MAX_QUEUE = 50;
const logBuffer: LogEntry[] = [];
const MAX_LOGS = 100;
let scannerStatus: ScannerStatus = {
  running: false,
  pairsScanned: 0,
  opportunitiesFound: 0,
  lastScanDurationMs: 0,
  lastScanAt: 0,
  totalScans: 0,
};
let lastQuoteAt = 0;
let minSpreadBps = 15; // configurable from settings, default 15bps min profit

// Consecutive failure tracking per pair — skip after MAX_CONSECUTIVE_FAILURES
const pairFailures = new Map<string, number>();
const MAX_CONSECUTIVE_FAILURES = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(level: LogEntry['level'], message: string) {
  const entry: LogEntry = { ts: Date.now(), level, message };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `[SolanaScanner] ${prefix} ${message}`
  );
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const start = Date.now();
      const res = await fetch(url);
      const elapsed = Date.now() - start;
      if (elapsed > 2000) log('warn', `[WARN] Jupiter API slow: ${(elapsed / 1000).toFixed(1)}s response`);
      if (res.ok) return res;
      if (res.status === 404) {
        throw new Error(`pair not available on devnet (404)`);
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        const backoff = Math.min(6000, 500 * 2 ** i + Math.random() * 200);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new Error(`Jupiter HTTP ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        const backoff = Math.min(6000, 500 * 2 ** i + Math.random() * 200);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastError ?? new Error('fetchWithRetry exhausted');
}

// ---------------------------------------------------------------------------
// Core scanning logic
// ---------------------------------------------------------------------------

export async function scanJupiter(
  inputMint: string,
  outputMint: string,
  amount: number
): Promise<JupiterQuote | null> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    slippageBps: '50',
    swapMode: 'ExactIn',
  });
  const url = `${JUPITER_API_BASE}/quote?${params}`;
  try {
    const res = await fetchWithRetry(url);
    const data = (await res.json()) as {
      inAmount?: string;
      outAmount?: string;
      priceImpactPct?: string;
      routePlan?: unknown[];
    };
    lastQuoteAt = Date.now();
    log(
      'info',
      `[JUPITER] route found ${inputMint.slice(0, 6)}→${outputMint.slice(0, 6)} inAmount: ${data.inAmount} outAmount: ${data.outAmount} swapMode: ExactIn routes: ${(data.routePlan ?? []).length}`
    );
    if (data.outAmount === '0' || data.outAmount === undefined) {
      log('warn', `[JUPITER] outAmount=0 for ${inputMint.slice(0, 6)}→${outputMint.slice(0, 6)} — mint may be invalid on devnet`);
    }
    return {
      inputMint,
      outputMint,
      inAmount: data.inAmount ?? '0',
      outAmount: data.outAmount ?? '0',
      priceImpactPct: data.priceImpactPct ?? '0',
      routePlan: data.routePlan ?? [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', `[SCAN] Quote failed ${inputMint.slice(0, 6)}→${outputMint.slice(0, 6)}: ${msg}`);
    return null;
  }
}

export async function detectArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
  const opps: ArbitrageOpportunity[] = [];
  for (const { a, b } of SCAN_PAIRS) {
    const pairKey = `${a}/${b}`;
    const failures = pairFailures.get(pairKey) ?? 0;

    // Skip pairs that consistently fail (no route on devnet)
    if (failures >= MAX_CONSECUTIVE_FAILURES) continue;

    const mintA = DEVNET_MINTS[a];
    const mintB = DEVNET_MINTS[b];
    if (!mintA || !mintB) continue;

    // Use 1 unit of token A, scaled by its decimals
    const decimalsA = DEVNET_DECIMALS[a] ?? 9;
    const amountIn = 10 ** decimalsA;
    const forward = await scanJupiter(mintA, mintB, amountIn);
    if (!forward || Number(forward.outAmount) === 0) {
      pairFailures.set(pairKey, failures + 1);
      if (failures + 1 >= MAX_CONSECUTIVE_FAILURES) {
        log('warn', `[SCAN] No route available for ${pairKey} on devnet — removing from active rotation`);
      } else {
        log('info', `[SCAN] No route available for ${pairKey} on devnet — skipping (${failures + 1}/${MAX_CONSECUTIVE_FAILURES})`);
      }
      continue;
    }

    const reverse = await scanJupiter(mintB, mintA, Number(forward.outAmount));
    if (!reverse || Number(reverse.outAmount) === 0) {
      pairFailures.set(pairKey, failures + 1);
      log('info', `[SCAN] No reverse route for ${pairKey} on devnet — skipping`);
      continue;
    }

    // Successful quotes — reset failure counter
    pairFailures.set(pairKey, 0);

    const spreadBps = Math.round(
      ((Number(reverse.outAmount) - amountIn) / amountIn) * 10000
    );

    // Profit is in token A's native units (SOL for SOL pairs, USDC for USDC pairs, etc.)
    const expectedProfitSol =
      (Number(reverse.outAmount) - amountIn) / (10 ** decimalsA);

    log(
      'info',
      `[SCAN] ${a}/${b} → ${spreadBps >= 0 ? '+' : ''}${spreadBps}bps spread`
    );

    if (spreadBps > minSpreadBps) {
      const confidence: ArbitrageOpportunity['confidence'] =
        spreadBps > 30 ? 'high' : spreadBps > 15 ? 'medium' : 'low';

      const opp: ArbitrageOpportunity = {
        id: `${a}-${b}-${Date.now()}`,
        pair: `${a}/${b}`,
        spreadBps,
        expectedProfitSol,
        route: `${a}→${b}→${a}`,
        forwardQuote: forward,
        reverseQuote: reverse,
        confidence,
        detectedAt: Date.now(),
        status: 'detected',
      };
      opps.push(opp);
      log('info', `[OPP] Detected ${a}/${b} ${spreadBps}bps — queued`);
    } else {
      log('info', `[SCAN] Below threshold: ${pairKey} ${spreadBps}bps < ${minSpreadBps}bps — skipping`);
    }
  }
  return opps;
}

async function runScan(): Promise<void> {
  const start = Date.now();
  try {
    const opps = await detectArbitrageOpportunities();
    const duration = Date.now() - start;

    for (const opp of opps) {
      opportunityQueue.push(opp);
      if (opportunityQueue.length > MAX_QUEUE) opportunityQueue.shift();
    }

    scannerStatus = {
      running: true,
      pairsScanned: SCAN_PAIRS.length,
      opportunitiesFound: scannerStatus.opportunitiesFound + opps.length,
      lastScanDurationMs: duration,
      lastScanAt: Date.now(),
      totalScans: scannerStatus.totalScans + 1,
    };

    log(
      'info',
      `[SCAN] Complete: ${SCAN_PAIRS.length} pairs, ${opps.length} opps, ${duration}ms`
    );
  } catch (err) {
    const duration = Date.now() - start;
    scannerStatus = { ...scannerStatus, lastScanDurationMs: duration, lastScanAt: Date.now() };
    log('error', `[SCAN] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startScanLoop(): void {
  if (running) {
    log('warn', 'Scanner already running');
    return;
  }
  running = true;
  scannerStatus.running = true;
  log('info', '[SCAN] Starting scan loop (5s interval)');

  const tick = async () => {
    if (!running) return;
    await runScan();
    if (running) scanTimer = setTimeout(tick, 5000);
  };
  // start immediately
  void tick();
}

export function stopScanLoop(): void {
  running = false;
  scannerStatus.running = false;
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  log('info', '[SCAN] Stopped');
}

export function getStatus(): ScannerStatus {
  return { ...scannerStatus, running };
}

export function getQueue(): ArbitrageOpportunity[] {
  return [...opportunityQueue];
}

export function getLogs(): LogEntry[] {
  return [...logBuffer];
}

export function getLastQuoteAge(): number {
  return lastQuoteAt > 0 ? Date.now() - lastQuoteAt : Infinity;
}

export function setMinSpreadBps(bps: number): void {
  minSpreadBps = bps;
}

export function isRunning(): boolean {
  return running;
}

export function addLog(level: LogEntry['level'], message: string): void {
  log(level, message);
}

export function updateOpportunity(id: string, update: Partial<ArbitrageOpportunity>): void {
  const opp = opportunityQueue.find((o) => o.id === id);
  if (opp) Object.assign(opp, update);
}

export function getActivePairs(): string[] {
  return SCAN_PAIRS
    .map(({ a, b }) => `${a}/${b}`)
    .filter((p) => (pairFailures.get(p) ?? 0) < MAX_CONSECUTIVE_FAILURES);
}

export function getSkippedPairs(): string[] {
  return SCAN_PAIRS
    .map(({ a, b }) => `${a}/${b}`)
    .filter((p) => (pairFailures.get(p) ?? 0) >= MAX_CONSECUTIVE_FAILURES);
}

export function getMinProfitBps(): number {
  return minSpreadBps;
}
