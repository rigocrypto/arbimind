/**
 * Cached USD prices from CoinGecko with DeFiLlama fallback.
 * Falls back to static estimates if both APIs are unavailable.
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

/** DeFiLlama uses coingecko: prefix for token lookups */
const DEFILLAMA_IDS: Record<PriceSymbol, string> = {
  ETH: 'coingecko:ethereum',
  SOL: 'coingecko:solana',
  USDC: 'coingecko:usd-coin',
};

interface PriceCacheEntry {
  prices: Record<string, number>;
  fetchedAtMs: number;
  expiresAtMs: number;
}

let cache: PriceCacheEntry | null = null;
/** When we get a 429, back off until this timestamp (ms). */
let rateLimitedUntilMs = 0;
const RATE_LIMIT_BACKOFF_MS = 60_000; // 1 minute backoff on 429

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

  // Skip fetch during 429 backoff period — serve stale cache or fallback
  if (now < rateLimitedUntilMs) {
    if (cache) {
      for (const s of symbols) {
        const v = cache.prices[s];
        if (typeof v === 'number' && v > 0) result[s] = v;
      }
    }
    return result;
  }

  const ids = [...new Set(symbols.map((s) => COINGECKO_IDS[s]))].join(',');
  const url = `${getBaseUrl()}/simple/price?ids=${ids}&vs_currencies=usd`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.status === 429) {
      rateLimitedUntilMs = now + RATE_LIMIT_BACKOFF_MS;
      console.warn(`[priceService] CoinGecko 429 — backing off ${RATE_LIMIT_BACKOFF_MS / 1000}s`);
      // Serve stale cache prices if available
      if (cache) {
        for (const s of symbols) {
          const v = cache.prices[s];
          if (typeof v === 'number' && v > 0) result[s] = v;
        }
      }
      return result;
    }
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
    console.warn('[priceService] CoinGecko fetch failed, trying DeFiLlama:', err instanceof Error ? err.message : err);

    // DeFiLlama fallback — free, no API key, generous rate limits
    try {
      const llamaPrices = await fetchDeFiLlama(symbols);
      if (llamaPrices) {
        const baseTtlMs = getTtlMs();
        const jitteredTtlMs = Math.floor(baseTtlMs * (0.9 + Math.random() * 0.2));
        cache = { prices: llamaPrices, fetchedAtMs: now, expiresAtMs: now + jitteredTtlMs };
        for (const s of symbols) {
          const v = llamaPrices[s];
          if (typeof v === 'number' && v > 0) result[s] = v;
        }
        return result;
      }
    } catch (llamaErr) {
      console.warn('[priceService] DeFiLlama fallback also failed:', llamaErr instanceof Error ? llamaErr.message : llamaErr);
    }

    return result;
  }
}

/**
 * Fetch prices from DeFiLlama coins API (free, no key required).
 * Returns null if the request fails or produces invalid data.
 */
async function fetchDeFiLlama(symbols: PriceSymbol[]): Promise<Record<string, number> | null> {
  const coins = symbols.map((s) => DEFILLAMA_IDS[s]).join(',');
  const url = `https://coins.llama.fi/prices/current/${coins}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const body: unknown = await res.json();
    if (!body || typeof body !== 'object') return null;
    const data = body as { coins?: Record<string, { price?: number }> };
    if (!data.coins || typeof data.coins !== 'object') return null;

    const prices: Record<string, number> = { ...FALLBACK };
    for (const s of symbols) {
      const llamaKey = DEFILLAMA_IDS[s];
      const price = data.coins[llamaKey]?.price;
      if (typeof price === 'number' && price > 0) {
        prices[s] = price;
      }
    }

    if (process.env.LOG_LEVEL === 'debug') {
      console.debug('[priceService] prices fetched from DeFiLlama');
    }
    return prices;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}
