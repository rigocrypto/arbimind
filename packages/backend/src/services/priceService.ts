/**
 * Cached USD prices from CoinGecko. Fallback to static estimates if unavailable.
 */

export type PriceSymbol = 'ETH' | 'SOL' | 'USDC';

const FALLBACK: Record<PriceSymbol, number> = {
  ETH: 3000,
  SOL: 200,
  USDC: 1,
};

const COINGECKO_IDS: Record<PriceSymbol, string> = {
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
};

interface PriceCacheEntry {
  prices: Record<string, number>;
  fetchedAtMs: number;
  expiresAtMs: number;
}

let cache: PriceCacheEntry | null = null;

function getTtlMs(): number {
  const sec = parseInt(process.env.COINGECKO_TTL_SECONDS || '600', 10) || 600;
  return Math.min(Math.max(sec, 60), 3600) * 1000;
}

function isEnabled(): boolean {
  const v = process.env.COINGECKO_ENABLED?.toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off';
}

function getBaseUrl(): string {
  return process.env.COINGECKO_BASE_URL?.trim() || 'https://api.coingecko.com/api/v3';
}

/**
 * Fetch USD prices for symbols. Uses cache; falls back to static estimates on error.
 */
export async function getPricesUsd(symbols: PriceSymbol[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const s of symbols) {
    result[s] = FALLBACK[s];
  }

  const now = Date.now();
  if (cache && now < cache.expiresAtMs) {
    for (const s of symbols) {
      const v = cache.prices[s];
      if (typeof v === 'number' && v > 0) result[s] = v;
    }
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug('[priceService] prices from cache');
    }
    return result;
  }

  if (!isEnabled()) return result;

  const ids = [...new Set(symbols.map((s) => COINGECKO_IDS[s]))].join(',');
  const url = `${getBaseUrl()}/simple/price?ids=${ids}&vs_currencies=usd`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const dataUnknown: unknown = await res.json();
    if (!dataUnknown || typeof dataUnknown !== 'object') {
      throw new Error('Invalid CoinGecko response (non-object)');
    }
    const data = dataUnknown as Record<string, { usd?: number }>;
    const prices: Record<string, number> = { ETH: FALLBACK.ETH, SOL: FALLBACK.SOL, USDC: FALLBACK.USDC };

    if (data.ethereum?.usd != null && data.ethereum.usd > 0) prices.ETH = data.ethereum.usd;
    if (data.solana?.usd != null && data.solana.usd > 0) prices.SOL = data.solana.usd;
    if (data['usd-coin']?.usd != null && data['usd-coin'].usd > 0) prices.USDC = data['usd-coin'].usd;

    const baseTtlMs = getTtlMs();
    const jitteredTtlMs = Math.floor(baseTtlMs * (0.9 + Math.random() * 0.2));
    cache = { prices, fetchedAtMs: now, expiresAtMs: now + jitteredTtlMs };
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug('[priceService] prices fetched from CoinGecko');
    }

    for (const s of symbols) {
      result[s] = prices[s] ?? FALLBACK[s];
    }
    return result;
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[priceService] CoinGecko fetch failed, using fallback:', err instanceof Error ? err.message : err);
    return result;
  }
}
