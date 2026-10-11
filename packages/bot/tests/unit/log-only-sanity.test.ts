import { describe, it, expect, vi, afterEach } from 'vitest';
import { ArbitrageBot } from '../../src/services/ArbitrageBot';
import { config, refreshConfig } from '../../src/config';

// ─────────────────────────────────────────────────────────────────
// N2: the EVM sanity transfer must honour bot LOG_ONLY.
//
// Before this fix maybeRunSanityTransfer() checked only sanityTxEnabled, so
// SANITY_TX_ENABLED=true (or its alias SANITY_MODE=true) sent a real
// transaction every interval even with LOG_ONLY / BOT_LOG_ONLY set. Flags are
// resolved through the real env parsing (refreshConfig); the execution
// service and provider are mocks, so nothing can reach a network.
// ─────────────────────────────────────────────────────────────────

const RECIPIENT = '0x000000000000000000000000000000000000dEaD';

const ENV_KEYS = [
  'SANITY_TX_ENABLED', 'SANITY_MODE', 'LOG_ONLY', 'BOT_LOG_ONLY', 'NETWORK', 'ALLOW_TESTNET_TRADES',
  'EVM_CHAIN', 'SANITY_TX_TO', 'SANITY_TX_WEI', 'SANITY_TX_INTERVAL_SEC', 'PRIVATE_KEY',
];

function applyEnv(env: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) vi.stubEnv(key, undefined);
  vi.stubEnv('SANITY_TX_TO', RECIPIENT);
  vi.stubEnv('SANITY_TX_WEI', '1');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  refreshConfig();
}

function buildBot() {
  const executeSanityTransfer = vi.fn().mockResolvedValue({
    hash: '0xmock', success: true, gasUsed: '21000', gasPrice: '1', profit: '0', timestamp: Date.now(),
  });
  const getBalance = vi.fn().mockResolvedValue(0n);
  const bot = new ArbitrageBot({
    executionService: { executeSanityTransfer } as never,
    provider: { getBalance } as never,
    priceService: {} as never,
  });
  const run = () => (bot as unknown as { maybeRunSanityTransfer(): Promise<void> }).maybeRunSanityTransfer();
  const botConfig = (bot as unknown as { botConfig: typeof config }).botConfig;
  return { bot, run, botConfig, executeSanityTransfer, getBalance };
}

afterEach(() => {
  vi.unstubAllEnvs();
  refreshConfig();
  vi.restoreAllMocks();
});

describe('N2 sanity transfer honours bot LOG_ONLY', () => {
  it('SANITY_TX_ENABLED=true + LOG_ONLY=true: never reaches executeSanityTransfer', async () => {
    applyEnv({ SANITY_TX_ENABLED: 'true', LOG_ONLY: 'true' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = buildBot();

    expect(t.botConfig.sanityTxEnabled).toBe(true);
    expect(t.botConfig.logOnly).toBe(true);
    await t.run();

    expect(t.executeSanityTransfer).not.toHaveBeenCalled();
    expect(t.getBalance).not.toHaveBeenCalled(); // gate sits before the balance lookup
    expect(errors).toHaveBeenCalledWith('[SANITY_SKIP] log_only');
  });

  it('alias SANITY_MODE=true + BOT_LOG_ONLY=true: never reaches executeSanityTransfer', async () => {
    applyEnv({ SANITY_MODE: 'true', BOT_LOG_ONLY: 'true' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = buildBot();

    expect(t.botConfig.sanityTxEnabled).toBe(true);
    expect(t.botConfig.logOnly).toBe(true);
    await t.run();

    expect(t.executeSanityTransfer).not.toHaveBeenCalled();
  });

  it('stays blocked across repeated ticks and logs the skip once', async () => {
    applyEnv({ SANITY_TX_ENABLED: 'true', LOG_ONLY: 'true', SANITY_TX_INTERVAL_SEC: '0' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = buildBot();

    await t.run();
    await t.run();
    await t.run();

    expect(t.executeSanityTransfer).not.toHaveBeenCalled();
    expect(errors.mock.calls.filter(([line]) => line === '[SANITY_SKIP] log_only')).toHaveLength(1);
  });

  it('counter-control: SANITY_TX_ENABLED=true + LOG_ONLY=false reaches the mocked sanity transfer', async () => {
    applyEnv({ SANITY_TX_ENABLED: 'true', LOG_ONLY: 'false' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = buildBot();

    expect(t.botConfig.sanityTxEnabled).toBe(true);
    expect(t.botConfig.logOnly).toBe(false);
    await t.run();

    expect(t.executeSanityTransfer).toHaveBeenCalledTimes(1);
    expect(t.executeSanityTransfer).toHaveBeenCalledWith(RECIPIENT, '1');
  });
});
