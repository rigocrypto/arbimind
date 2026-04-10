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
/*  Subset of EngineSettings the bot actually consumes at runtime     */
/* ------------------------------------------------------------------ */
export interface RuntimeSettings {
  /* PR 1A — core engine */
  autoTrade: boolean;
  minProfitEth: number;
  maxGasGwei: number;
  // preferredChains: string[];  // TODO: multi-chain not yet supported in scan loop

  /* PR 1B — advanced engine (only settings with real enforcement paths) */
  slippagePct: number;              // replaces hardcoded 0.5% in ExecutionService
  requiredConfirmations: number;    // passed to ethers tx.wait(confirms)
}

/* ------------------------------------------------------------------ */
/*  Reader                                                            */
/* ------------------------------------------------------------------ */
export class SettingsReader {
  private readonly logger = new Logger('SettingsReader');
  private readonly apiUrl: string;
  private readonly backendBaseUrl: string;
  private readonly refreshMs: number;
  private readonly authRefreshMs: number;

  private cached: RuntimeSettings | null = null;
  private lastFetchMs = 0;
  private botAuthorized = true;
  private lastAuthFetchMs = 0;
  private walletAddress: string | null;

  /** Env-var fallback when backend is unreachable. */
  private readonly envDefaults: RuntimeSettings;

  constructor(opts: {
    apiUrl?: string;
    refreshSec?: number;
    authRefreshSec?: number;
    envDefaults: RuntimeSettings;
  }) {
    this.apiUrl =
      opts.apiUrl ||
      process.env['SETTINGS_API_URL'] ||
      (process.env['BACKEND_URL'] ? `${process.env['BACKEND_URL'].replace(/\/+$/, '')}/api/settings` : '') ||
      'http://localhost:8000/api/settings';
    this.backendBaseUrl = this.apiUrl.replace(/\/api\/settings\/?$/, '');
    this.refreshMs = (opts.refreshSec ?? 30) * 1000;
    this.authRefreshMs = (opts.authRefreshSec ?? 15) * 1000;
    this.envDefaults = opts.envDefaults;
    this.walletAddress = process.env['WALLET_ADDRESS']?.trim() || null;
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
          slippagePct?: number;
          requiredConfirmations?: number;
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
        slippagePct: typeof s.slippagePct === 'number' ? s.slippagePct : this.envDefaults.slippagePct,
        requiredConfirmations: typeof s.requiredConfirmations === 'number' ? s.requiredConfirmations : this.envDefaults.requiredConfirmations,
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

  async refreshBotAuthorization(): Promise<void> {
    const now = Date.now();
    if (now - this.lastAuthFetchMs < this.authRefreshMs) {
      return;
    }
    this.lastAuthFetchMs = now;

    if (!this.walletAddress) {
      this.setBotAuthorized(true, 'wallet_missing_dev_mode');
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `${this.backendBaseUrl}/api/activate-bot/${encodeURIComponent(this.walletAddress)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        this.setBotAuthorized(false, `activation_status_${res.status}`);
        return;
      }

      const payload = await res.json() as {
        ok?: boolean;
        user?: {
          paymentStatus?: string;
          botActive?: boolean;
          botRunning?: boolean;
        };
      };

      const user = payload.user;
      const authorized = Boolean(
        payload.ok &&
        user?.paymentStatus === 'paid' &&
        user?.botActive === true &&
        user?.botRunning === true
      );

      this.setBotAuthorized(authorized, authorized ? 'authorized' : 'activation_not_paid_or_inactive');
    } catch (err) {
      // Fail-open: do not block execution solely due to temporary backend outage.
      this.setBotAuthorized(true, 'activation_check_unreachable_fail_open');
      this.logger.debug('Activation check failed, fail-open applied', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  isBotAuthorized(): boolean {
    return this.botAuthorized;
  }

  private setBotAuthorized(next: boolean, reason: string): void {
    const previous = this.botAuthorized;
    this.botAuthorized = next;
    if (previous !== next) {
      this.logger.warn(`BOT_GATE authorization changed: ${previous} -> ${next}`, { reason });
    }
  }
}
