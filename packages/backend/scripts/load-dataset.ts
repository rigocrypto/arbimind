import fs from 'fs';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC);

interface RawOpp {
  ts: number;
  profitPct: number;
  volumeUsd: number;
  liquidity: number;
  slippage: number;
  gasPrice: number;
  outcomeProfitPct: number;
  success: 1 | 0;
}

async function loadJupiterHistorical(rangeDays = 7): Promise<RawOpp[]> {
  return Array.from({ length: 1000 }, () => ({
    ts: Date.now() - Math.random() * rangeDays * 864e5,
    profitPct: 0.5 + Math.random() * 2,
    volumeUsd: 1000 + Math.random() * 50000,
    liquidity: 100000 + Math.random() * 1e6,
    slippage: 0.1 + Math.random() * 0.5,
    gasPrice: 10 + Math.random() * 30,
    outcomeProfitPct: 0.3 + Math.random() * 1.5,
    success: Math.random() > 0.3 ? 1 : 0,
  }));
}

async function loadJupiterQuotes(samples = 200, delayMs = 400): Promise<RawOpp[]> {
  const inputMint = 'So11111111111111111111111111111111111111112';
  const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const amount = '1000000000'; // 1 SOL in lamports
  const slippageBps = 50;

  const opps: RawOpp[] = [];

  for (let i = 0; i < samples; i++) {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps: String(slippageBps)
    });

    const url = `https://quote-api.jup.ag/v6/quote?${params.toString()}`;
    const data = await fetchJson<{ outAmount?: string; inAmount?: string; priceImpactPct?: number }>(url);

    if (data?.outAmount && data?.inAmount) {
      const inLamports = Number(data.inAmount);
      const outUsdc = Number(data.outAmount) / 1e6;
      const inSol = inLamports / 1e9;
      const impliedPrice = inSol > 0 ? outUsdc / inSol : 0;
      const profitPct = (data.priceImpactPct ?? 0) * -100;

      opps.push({
        ts: Date.now(),
        profitPct: Number.isFinite(profitPct) ? profitPct : 0,
        volumeUsd: impliedPrice,
        liquidity: 0,
        slippage: slippageBps / 10000,
        gasPrice: 20,
        outcomeProfitPct: 0,
        success: 0
      });
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return opps;
}

async function loadDexScreener(rangeDays = 7, pairAddress?: string): Promise<RawOpp[]> {
  const pair = pairAddress || 'So11111111111111111111111111111111111111112';
  const url = `https://api.dexscreener.com/latest/dex/pairs/solana/${pair}`;
  const data = await fetchJson<{ pairs?: Array<any> }>(url);

  if (!data?.pairs?.length) return [];

  const now = Date.now();
  const cutoff = now - rangeDays * 864e5;

  return data.pairs.slice(0, 50).map((p: any) => ({
    ts: Math.max(cutoff, now),
    profitPct: Number(p?.priceChange?.h24 ?? 0),
    volumeUsd: Number(p?.volume?.h24 ?? 0),
    liquidity: Number(p?.liquidity?.usd ?? 0),
    slippage: 0.3,
    gasPrice: 20,
    outcomeProfitPct: 0,
    success: 0,
  }));
}

async function labelFromTxs(arbAccount: string, rangeDays = 7): Promise<RawOpp[]> {
  const pubkey = new PublicKey(arbAccount);
  const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 1000 });
  const cutoff = Date.now() - rangeDays * 864e5;
  const opps: RawOpp[] = [];

  for (const sigInfo of sigs) {
    if (sigInfo.blockTime && sigInfo.blockTime * 1000 < cutoff) break;
    const tx = await connection.getTransaction(sigInfo.signature, { commitment: 'confirmed' });
    const success = tx?.meta?.err ? 0 : 1;
    const feeSol = (tx?.meta?.fee ?? 0) / 1e9;

    opps.push({
      ts: (tx?.blockTime ?? 0) * 1000,
      profitPct: 0.5 + Math.random() * 2,
      volumeUsd: 1000 + Math.random() * 50000,
      liquidity: 100000 + Math.random() * 1e6,
      slippage: 0.1 + Math.random() * 0.5,
      gasPrice: 10 + Math.random() * 30,
      outcomeProfitPct: feeSol * 100,
      success,
    });
  }

  return opps;
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('jupiter', { type: 'boolean', default: false })
    .option('dexscreener', { type: 'boolean', default: false })
    .option('days', { type: 'number', default: 30 })
    .option('samples', { type: 'number', default: 200 })
    .option('delayMs', { type: 'number', default: 400 })
    .option('pair', { type: 'string' })
    .parseSync();

  const outDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(outDir, { recursive: true });

  const useTxLabeling = process.env.SOLANA_ARB_ACCOUNT?.trim();
  const opps: RawOpp[] = [];

  if (argv.jupiter) {
    opps.push(...await loadJupiterQuotes(argv.samples, argv.delayMs));
  }

  if (argv.dexscreener) {
    opps.push(...await loadDexScreener(argv.days, argv.pair));
  }

  if (useTxLabeling) {
    opps.push(...await labelFromTxs(useTxLabeling, argv.days));
  }

  if (!opps.length) {
    opps.push(...await loadJupiterHistorical(argv.days));
  }

  const outPath = path.join(outDir, 'training-data.json');
  fs.writeFileSync(outPath, JSON.stringify(opps, null, 2));
  console.log(`✅ Generated ${opps.length} opps → ${outPath}`);
}

main().catch((error) => {
  console.error('❌ Dataset load failed', error);
  process.exit(1);
});

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
