import { describe, it, expect, vi, afterEach } from 'vitest';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// ─────────────────────────────────────────────────────────────────
// [EXECUTION_SAFETY_BOOT] reports what THIS process resolved -- the evidence
// a deploy needs, since configuration at rest does not prove what a running
// process loaded. It must carry correct booleans and a signer source
// category, and nothing secret. Keys here are generated in-process.
// ─────────────────────────────────────────────────────────────────

const COLD_IMPORT_TIMEOUT_MS = 60_000;
const SECRET_RPC = 'https://rpc.example.invalid/?api-key=SYNTHETIC-RPC-TOKEN-123';

const syntheticKey = () => bs58.encode(Keypair.generate().secretKey);

const ENV_KEYS = [
  'LOG_ONLY', 'BOT_LOG_ONLY', 'NETWORK', 'SANITY_TX_ENABLED', 'SANITY_MODE', 'SOLANA_LOG_ONLY',
  'SOLANA_AUTO_FUND_ENABLED', 'SOLANA_AUTO_REBALANCE_ENABLED', 'SOLANA_PRIVATE_KEY_BASE58',
  'SOLANA_PRIVATE_KEY_BASE58Y_BASE58', 'SOLANA_ARB_SECRET_KEY', 'SOLANA_TREASURY_SECRET_KEY',
];

async function bootLine(env: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) vi.stubEnv(key, undefined);
  vi.stubEnv('SOLANA_RPC_URL', SECRET_RPC);
  vi.stubEnv('ETHEREUM_RPC_URL', SECRET_RPC);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { logExecutionSafetyBoot } = await import('../../src/safety/executionSafetyBoot');
  const lines: string[] = [];
  const returned = logExecutionSafetyBoot((line) => lines.push(line));
  expect(lines).toHaveLength(1);
  const line = lines[0]!;
  expect(line.startsWith('[EXECUTION_SAFETY_BOOT] ')).toBe(true);
  const parsed = JSON.parse(line.slice('[EXECUTION_SAFETY_BOOT] '.length));
  expect(parsed).toEqual(returned);
  return { line, parsed };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('[EXECUTION_SAFETY_BOOT]', () => {
  it('reports resolved flags and the dedicated signer source, without any secret', async () => {
    const dedicated = syntheticKey();
    const treasury = syntheticKey();
    const { line, parsed } = await bootLine({
      LOG_ONLY: 'true',
      SANITY_TX_ENABLED: 'true',
      SOLANA_LOG_ONLY: 'false',
      SOLANA_AUTO_FUND_ENABLED: 'true',
      SOLANA_AUTO_REBALANCE_ENABLED: 'false',
      SOLANA_PRIVATE_KEY_BASE58: dedicated,
      SOLANA_TREASURY_SECRET_KEY: treasury,
    });

    expect(parsed).toEqual({
      botLogOnly: true,
      solanaLogOnly: false,
      sanityTxEnabled: true,
      autoFundEnabled: true,
      autoRebalanceEnabled: false,
      solanaSignerConfigured: true,
      solanaSignerSource: 'SOLANA_PRIVATE_KEY_BASE58',
    });
    expect(line).not.toContain(dedicated);
    expect(line).not.toContain(treasury);
    expect(line).not.toContain('SYNTHETIC-RPC-TOKEN-123');
    expect(line).not.toContain('rpc.example.invalid');
    expect(line).not.toContain(Keypair.fromSecretKey(bs58.decode(dedicated)).publicKey.toBase58());
  }, COLD_IMPORT_TIMEOUT_MS);

  it('treasury aliases only -> signer not configured, source none (and still no secret)', async () => {
    const arb = syntheticKey();
    const treasury = syntheticKey();
    const { line, parsed } = await bootLine({
      SOLANA_ARB_SECRET_KEY: arb,
      SOLANA_TREASURY_SECRET_KEY: treasury,
    });

    expect(parsed.solanaSignerConfigured).toBe(false);
    expect(parsed.solanaSignerSource).toBe('none');
    expect(parsed.solanaLogOnly).toBe(true); // default
    expect(parsed.autoFundEnabled).toBe(false); // default
    expect(parsed.sanityTxEnabled).toBe(false); // default
    expect(line).not.toContain(arb);
    expect(line).not.toContain(treasury);
  }, COLD_IMPORT_TIMEOUT_MS);

  it('reports the legacy alias as a category, never its value; SANITY_MODE / BOT_LOG_ONLY aliases resolve', async () => {
    const legacy = syntheticKey();
    const { line, parsed } = await bootLine({
      SOLANA_PRIVATE_KEY_BASE58Y_BASE58: legacy,
      SANITY_MODE: 'true',
      BOT_LOG_ONLY: 'true',
    });

    expect(parsed.solanaSignerConfigured).toBe(true);
    expect(parsed.solanaSignerSource).toBe('legacy_alias');
    expect(parsed.sanityTxEnabled).toBe(true);
    expect(parsed.botLogOnly).toBe(true);
    expect(line).not.toContain(legacy);
  }, COLD_IMPORT_TIMEOUT_MS);
});
