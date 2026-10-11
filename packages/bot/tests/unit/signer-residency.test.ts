import { describe, it, expect, vi, afterEach } from 'vitest';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { resolveSolanaSigner } from '../../src/solana/config';

// ─────────────────────────────────────────────────────────────────
// Signer residency: the bot (execution plane) must not inherit backend
// treasury credentials by alias. SOLANA_ARB_SECRET_KEY and
// SOLANA_TREASURY_SECRET_KEY are no longer accepted as the bot's Solana
// signer. All keys below are generated in-process and never funded.
// ─────────────────────────────────────────────────────────────────

const syntheticKey = () => bs58.encode(Keypair.generate().secretKey);
const COLD_IMPORT_TIMEOUT_MS = 30_000;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSolanaSigner', () => {
  it('ignores SOLANA_ARB_SECRET_KEY and SOLANA_TREASURY_SECRET_KEY: not configured', () => {
    const signer = resolveSolanaSigner({
      SOLANA_ARB_SECRET_KEY: syntheticKey(),
      SOLANA_TREASURY_SECRET_KEY: syntheticKey(),
    });

    expect(signer).toEqual({ value: '', source: 'none' });
  });

  it('accepts the dedicated SOLANA_PRIVATE_KEY_BASE58', () => {
    const dedicated = syntheticKey();
    const signer = resolveSolanaSigner({ SOLANA_PRIVATE_KEY_BASE58: dedicated });

    expect(signer.source).toBe('SOLANA_PRIVATE_KEY_BASE58');
    expect(signer.value).toBe(dedicated);
  });

  it('a treasury alias never outranks or supplements the dedicated key', () => {
    const dedicated = syntheticKey();
    const signer = resolveSolanaSigner({
      SOLANA_PRIVATE_KEY_BASE58: dedicated,
      SOLANA_TREASURY_SECRET_KEY: syntheticKey(),
      SOLANA_ARB_SECRET_KEY: syntheticKey(),
    });

    expect(signer).toEqual({ value: dedicated, source: 'SOLANA_PRIVATE_KEY_BASE58' });
  });

  it('still reads the malformed legacy alias (removal is #406, out of scope here)', () => {
    const legacy = syntheticKey();
    expect(resolveSolanaSigner({ SOLANA_PRIVATE_KEY_BASE58Y_BASE58: legacy }))
      .toEqual({ value: legacy, source: 'legacy_alias' });
  });
});

describe('solanaExecutorConfig (module-level, real env)', () => {
  async function loadConfig(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.resetModules();
    return import('../../src/solana/config');
  }

  it('treasury aliases only -> bot Solana signer NOT CONFIGURED', async () => {
    const cfg = await loadConfig({
      SOLANA_PRIVATE_KEY_BASE58: undefined,
      SOLANA_PRIVATE_KEY_BASE58Y_BASE58: undefined,
      SOLANA_ARB_SECRET_KEY: syntheticKey(),
      SOLANA_TREASURY_SECRET_KEY: syntheticKey(),
    });

    expect(cfg.solanaExecutorConfig.privateKeyBase58).toBe('');
    expect(cfg.solanaSignerSource).toBe('none');
  }, COLD_IMPORT_TIMEOUT_MS);

  it('control: dedicated key -> CONFIGURED from SOLANA_PRIVATE_KEY_BASE58', async () => {
    const dedicated = syntheticKey();
    const cfg = await loadConfig({
      SOLANA_PRIVATE_KEY_BASE58: dedicated,
      SOLANA_PRIVATE_KEY_BASE58Y_BASE58: undefined,
      SOLANA_ARB_SECRET_KEY: undefined,
      SOLANA_TREASURY_SECRET_KEY: undefined,
    });

    expect(cfg.solanaExecutorConfig.privateKeyBase58).toBe(dedicated);
    expect(cfg.solanaSignerSource).toBe('SOLANA_PRIVATE_KEY_BASE58');
  }, COLD_IMPORT_TIMEOUT_MS);
});
