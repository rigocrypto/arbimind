/**
 * SettingsReader — fetches engine settings from the backend API with caching.
 *
 * The bot uses env vars for its initial config, but runtime-adjustable settings
 * (autoTrade, minProfitEth, maxGasGwei) are fetched from the backend settings
 * API so the dashboard can control the engine without a restart.
 *
 * Settings are cached for `SETTINGS_REFRESH_SEC` (default 30s) to avoid
 * hammering the backend every scan cycle.
 *
 * If the backend is unreachable the reader falls back to env-var defaults —
 * the bot never blocks on a settings fetch failure.
 */

import { Logger } from '../utils/Logger';

/* ------------------------------------------------------------------ */
/*  Subset of EngineSettings the bot actually consumes (PR 1A scope)  */
/* ------------------------------------------------------------------ */
export interface RuntimeSettings {
  autoTrade: boolean;
  minProfitEth: number;
  maxGasGwei: number;
  // preferredChains: string[];  // TODO: multi-chain not yet supported in scan loop
}

/* ------------------------------------------------------------------ */
/*  Reader                                                            */
/* ------------------------------------------------------------------ */
export class SettingsReader {
  private readonly logger = new Logger('SettingsReader');
  private readonly apiUrl: string;
  private readonly refreshMs: number;

  private cached: RuntimeSettings | null = null;
  private lastFetchMs = 0;

  /** Env-var fallback when backend is unreachable. */
  private readonly envDefaults: RuntimeSettings;

  constructor(opts: {
    apiUrl?: string;
    refreshSec?: number;
    envDefaults: RuntimeSettings;
  }) {
    this.apiUrl =
      opts.apiUrl ||
      process.env['SETTINGS_API_URL'] ||
      'http://localhost:8000/api/settings';
    this.refreshMs = (opts.refreshSec ?? 30) * 1000;
    this.envDefaults = opts.envDefaults;
  }

  /**
   * Get current runtime settings.
   * Returns cached values within the refresh window; fetches fresh values
   * once the cache expires. Never throws — returns env defaults on error.
   */
  async get(): Promise<RuntimeSettings> {
    const now = Date.now();
    if (this.cached && now - this.lastFetchMs < this.refreshMs) {
      return this.cached;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(this.apiUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        this.logger.debug('Settings API returned non-OK', { status: res.status });
        return this.fallback();
      }

      const json = await res.json() as {
        ok?: boolean;
        settings?: {
          autoTrade?: boolean;
          minProfitEth?: number;
          maxGasGwei?: number;
        };
      };
      if (!json.ok || !json.settings) {
        this.logger.debug('Settings API response missing ok/settings');
        return this.fallback();
      }

      const s = json.settings;
      this.cached = {
        autoTrade: typeof s.autoTrade === 'boolean' ? s.autoTrade : this.envDefaults.autoTrade,
        minProfitEth: typeof s.minProfitEth === 'number' ? s.minProfitEth : this.envDefaults.minProfitEth,
        maxGasGwei: typeof s.maxGasGwei === 'number' ? s.maxGasGwei : this.envDefaults.maxGasGwei,
      };
      this.lastFetchMs = now;

      this.logger.debug('Settings refreshed from backend', this.cached);
      return this.cached;
    } catch (err) {
      this.logger.debug('Settings fetch failed, using fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.fallback();
    }
  }

  private fallback(): RuntimeSettings {
    if (this.cached) return this.cached;   // stale cache > nothing
    return this.envDefaults;
  }
}
