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
  private readonly allowRemoteExecutionOverrides: boolean;

  private cached: RuntimeSettings | null = null;
  private lastFetchMs = 0;
  private botAuthorized = true;
  private lastAuthFetchMs = 0;
  private walletAddress: string | null;
  private warnedUntrustedSettingsOrigin = false;

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
    this.allowRemoteExecutionOverrides = this.isTrustedOrigin(this.apiUrl);
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
      const remote = {
        autoTrade: typeof s.autoTrade === 'boolean' ? s.autoTrade : this.envDefaults.autoTrade,
        minProfitEth: typeof s.minProfitEth === 'number' ? s.minProfitEth : this.envDefaults.minProfitEth,
        maxGasGwei: typeof s.maxGasGwei === 'number' ? s.maxGasGwei : this.envDefaults.maxGasGwei,
        slippagePct: typeof s.slippagePct === 'number' ? s.slippagePct : this.envDefaults.slippagePct,
        requiredConfirmations: typeof s.requiredConfirmations === 'number' ? s.requiredConfirmations : this.envDefaults.requiredConfirmations,
      };
      this.cached = this.sanitizeRuntimeSettings(remote);
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

  private sanitizeRuntimeSettings(remote: RuntimeSettings): RuntimeSettings {
    const boundedMinProfitEth = this.clampFinite(remote.minProfitEth, 0, 10, this.envDefaults.minProfitEth);
    const boundedMaxGasGwei = this.clampFinite(remote.maxGasGwei, 1, 2000, this.envDefaults.maxGasGwei);

    if (!this.allowRemoteExecutionOverrides) {
      if (!this.warnedUntrustedSettingsOrigin) {
        this.warnedUntrustedSettingsOrigin = true;
        this.logger.warn('Settings API origin is not trusted; execution-critical overrides are ignored', {
          apiUrl: this.apiUrl,
        });
      }

      return {
        autoTrade: this.envDefaults.autoTrade,
        minProfitEth: boundedMinProfitEth,
        maxGasGwei: boundedMaxGasGwei,
        slippagePct: this.envDefaults.slippagePct,
        requiredConfirmations: this.envDefaults.requiredConfirmations,
      };
    }

    return {
      autoTrade: remote.autoTrade,
      minProfitEth: boundedMinProfitEth,
      maxGasGwei: boundedMaxGasGwei,
      slippagePct: this.clampFinite(remote.slippagePct, 0.05, 2, this.envDefaults.slippagePct),
      requiredConfirmations: Math.floor(this.clampFinite(remote.requiredConfirmations, 1, 25, this.envDefaults.requiredConfirmations)),
    };
  }

  private clampFinite(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  private isTrustedOrigin(url: string): boolean {
    const parsed = this.safeParseUrl(url);
    if (!parsed) return false;

    const origin = parsed.origin;
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (isLocal) return true;

    const allowlistRaw = process.env['SETTINGS_ALLOWED_ORIGINS'] || process.env['TRUSTED_BACKEND_ORIGINS'] || process.env['BACKEND_URL'] || '';
    const allowedOrigins = allowlistRaw
      .split(',')
      .map((entry) => this.safeParseUrl(entry.trim()))
      .filter((entry): entry is URL => Boolean(entry))
      .map((entry) => entry.origin);

    return allowedOrigins.includes(origin);
  }

  private safeParseUrl(value: string): URL | null {
    try {
      return new URL(value);
    } catch {
      return null;
    }
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
