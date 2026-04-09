/**
 * retryQuote — thin retry wrapper for DEX quote RPC calls.
 *
 * Designed for V2-style `getAmountsOut` calls that can fail with transient
 * CALL_EXCEPTION / missing-revert-data errors. Retries a small number of
 * times with a brief delay, then gives up and returns null.
 */

export interface RetryQuoteOptions {
  /** Total attempts including the first. Default: 2 */
  attempts?: number;
  /** Delay between attempts in ms. Default: 300 */
  delayMs?: number;
  /** Label for log context (e.g. "SUSHISWAP/WETH/USDC.e"). Default: "QUOTE" */
  label?: string;
}

/**
 * Runs `fn()` up to `opts.attempts` times.
 * Logs `[QUOTE_RETRY]` on each non-final failure and `[QUOTE_RETRY_FAILED]`
 * once all attempts are exhausted.
 * Returns null (never throws) so callers can treat it like any other quote miss.
 */
export async function retryQuote<T>(
  fn: () => Promise<T>,
  opts: RetryQuoteOptions = {},
): Promise<T | null> {
  const { attempts = 2, delayMs = 300, label = 'QUOTE' } = opts;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isLast = i === attempts;
      if (isLast) {
        console.log('[QUOTE_RETRY_FAILED]', {
          label,
          attempts,
          error: msg.slice(0, 200),
        });
        return null;
      }
      console.log('[QUOTE_RETRY]', {
        label,
        attempt: i,
        of: attempts,
        error: msg.slice(0, 120),
      });
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}
