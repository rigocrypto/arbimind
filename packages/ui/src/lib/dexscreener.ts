/**
 * DexScreener API client for Solana pair data.
 * Returns null on any failure — never throws to UI.
 */

export interface DexPairData {
  pairAddress: string;
  baseToken: { symbol: string; name: string; address: string };
  quoteToken: { symbol: string; name: string; address: string };
  dexId: string;
  priceUsd: number;
  priceNative: string;
  volume: { m5: number; h1: number; h6: number; h24: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  liquidity: { usd: number; base: number; quote: number };
  txns: { m5: { buys: number; sells: number }; h1: { buys: number; sells: number }; h24: { buys: number; sells: number } };
  fdv: number | null;
  pairCreatedAt: number | null;
  url: string;
  fetchedAt: number;
}

interface DexScreenerApiPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { symbol?: string; name?: string; address?: string };
  quoteToken?: { symbol?: string; name?: string; address?: string };
  priceUsd?: string;
  priceNative?: string;
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  fdv?: number;
  pairCreatedAt?: number;
  url?: string;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parsePair(raw: DexScreenerApiPair): DexPairData {
  return {
    pairAddress: raw.pairAddress ?? '',
    baseToken: {
      symbol: raw.baseToken?.symbol ?? '???',
      name: raw.baseToken?.name ?? '',
      address: raw.baseToken?.address ?? '',
    },
    quoteToken: {
      symbol: raw.quoteToken?.symbol ?? '???',
      name: raw.quoteToken?.name ?? '',
      address: raw.quoteToken?.address ?? '',
    },
    dexId: raw.dexId ?? 'unknown',
    priceUsd: num(raw.priceUsd),
    priceNative: raw.priceNative ?? '0',
    volume: {
      m5: num(raw.volume?.m5),
      h1: num(raw.volume?.h1),
      h6: num(raw.volume?.h6),
      h24: num(raw.volume?.h24),
    },
    priceChange: {
      m5: num(raw.priceChange?.m5),
      h1: num(raw.priceChange?.h1),
      h6: num(raw.priceChange?.h6),
      h24: num(raw.priceChange?.h24),
    },
    liquidity: {
      usd: num(raw.liquidity?.usd),
      base: num(raw.liquidity?.base),
      quote: num(raw.liquidity?.quote),
    },
    txns: {
      m5: { buys: num(raw.txns?.m5?.buys), sells: num(raw.txns?.m5?.sells) },
      h1: { buys: num(raw.txns?.h1?.buys), sells: num(raw.txns?.h1?.sells) },
      h24: { buys: num(raw.txns?.h24?.buys), sells: num(raw.txns?.h24?.sells) },
    },
    fdv: raw.fdv != null ? num(raw.fdv) : null,
    pairCreatedAt: raw.pairCreatedAt ?? null,
    url: raw.url ?? '',
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch a Solana pair from DexScreener public API.
 * Returns null on 404, network error, or bad response.
 */
export async function fetchPair(pairAddress: string): Promise<DexPairData | null> {
  if (!pairAddress || pairAddress.length < 20) return null;

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/solana/${encodeURIComponent(pairAddress)}`,
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const pair: DexScreenerApiPair | undefined = json?.pair ?? json?.pairs?.[0];
    if (!pair) return null;

    return parsePair(pair);
  } catch {
    return null;
  }
}
