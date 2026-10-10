import express from 'express';
import request from 'supertest';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';

// ---------------------------------------------------------------------------
// POST /api/solana/tx/withdraw used to sign a treasury transfer to a
// caller-chosen destination/amount/cluster and broadcast it with no auth.
// These tests prove the route now refuses every request before any signer is
// loaded and before anything is signed or sent -- with a VALID treasury key
// configured, so a regression would actually reach the signer and be caught.
// ---------------------------------------------------------------------------

// Throwaway key generated in-process. Never funded, never a real credential.
const TEST_TREASURY = Keypair.generate();
const ENV_KEYS = [
  'SOLANA_TREASURY_SECRET_KEY',
  'ADMIN_KEY',
  'LOG_ONLY',
  'SOLANA_LOG_ONLY',
  'TRADING_ENABLED',
  'SOLANA_TRADING_ENABLED',
  'SOLANA_CLUSTER',
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

import solanaTxRouter from '../routes/solanaTx';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/solana/tx', solanaTxRouter);
  return app;
}

const VALID_BODY = {
  amountSol: 1,
  toPubkey: Keypair.generate().publicKey.toBase58(),
};

let fromSecretKey: jest.SpyInstance;
let fromSeed: jest.SpyInstance;
let txSign: jest.SpyInstance;
let sendRaw: jest.SpyInstance;
let sendTx: jest.SpyInstance;
let blockhash: jest.SpyInstance;

beforeAll(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

beforeEach(() => {
  process.env.SOLANA_TREASURY_SECRET_KEY = JSON.stringify(Array.from(TEST_TREASURY.secretKey));
  fromSecretKey = jest.spyOn(Keypair, 'fromSecretKey');
  fromSeed = jest.spyOn(Keypair, 'fromSeed');
  txSign = jest.spyOn(VersionedTransaction.prototype, 'sign');
  // Mocked so that even a regression could never reach the network.
  sendRaw = jest.spyOn(Connection.prototype, 'sendRawTransaction').mockResolvedValue('mock-sig');
  sendTx = jest.spyOn(Connection.prototype, 'sendTransaction').mockResolvedValue('mock-sig');
  blockhash = jest
    .spyOn(Connection.prototype, 'getLatestBlockhash')
    .mockResolvedValue({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function expectNoSignerOrBroadcast() {
  expect(fromSecretKey).not.toHaveBeenCalled();
  expect(fromSeed).not.toHaveBeenCalled();
  expect(blockhash).not.toHaveBeenCalled();
  expect(txSign).not.toHaveBeenCalled();
  expect(sendRaw).not.toHaveBeenCalled();
  expect(sendTx).not.toHaveBeenCalled();
}

function expectDenied(res: request.Response) {
  expect(res.status).toBe(403);
  expect(res.body.error).toBe('withdraw_disabled');
  expect(res.body).not.toHaveProperty('signature');
  expect(res.body).not.toHaveProperty('txSig');
  expect(res.body).not.toHaveProperty('fromPubkey');
}

describe('POST /api/solana/tx/withdraw is disabled (fail-closed)', () => {
  it('A: denies an unauthenticated caller without loading the signer, signing, or sending', async () => {
    const res = await request(buildApp()).post('/api/solana/tx/withdraw').send(VALID_BODY);

    expectDenied(res);
    expectNoSignerOrBroadcast();
  });

  it.each(['mainnet-beta', 'devnet', 'testnet', 'bogus', ''])(
    'B: caller-chosen cluster %p cannot reach signing or broadcast',
    async (cluster) => {
      const res = await request(buildApp())
        .post(`/api/solana/tx/withdraw?cluster=${encodeURIComponent(cluster)}`)
        .send(VALID_BODY);

      expectDenied(res);
      expectNoSignerOrBroadcast();
    },
  );

  it('B: an env-selected mainnet cluster does not re-enable the route', async () => {
    process.env.SOLANA_CLUSTER = 'mainnet-beta';

    const res = await request(buildApp()).post('/api/solana/tx/withdraw').send(VALID_BODY);

    expectDenied(res);
    expectNoSignerOrBroadcast();
  });

  it.each([
    ['no credentials', {}],
    ['a wrong admin key', { 'x-admin-key': 'wrong-key' }],
    ['the correct shared admin key', { 'x-admin-key': 'test-admin-key' }],
    ['a bearer token', { Authorization: 'Bearer anything' }],
  ])('C: fails closed with %s -- no credential re-enables treasury signing', async (_label, headers) => {
    process.env.ADMIN_KEY = 'test-admin-key';

    const res = await request(buildApp())
      .post('/api/solana/tx/withdraw')
      .set(headers as Record<string, string>)
      .send(VALID_BODY);

    expectDenied(res);
    expectNoSignerOrBroadcast();
  });

  it('D: safety holds at the route itself, independent of LOG_ONLY / trading flags', async () => {
    process.env.LOG_ONLY = 'false';
    process.env.SOLANA_LOG_ONLY = 'false';
    process.env.TRADING_ENABLED = 'true';
    process.env.SOLANA_TRADING_ENABLED = 'true';

    const res = await request(buildApp()).post('/api/solana/tx/withdraw').send(VALID_BODY);

    expectDenied(res);
    expectNoSignerOrBroadcast();
  });

  it('denies malformed and empty bodies the same way (no input reaches validation)', async () => {
    const app = buildApp();
    for (const body of [{}, { amountSol: -1 }, { toPubkey: 'not-an-address' }]) {
      const res = await request(app).post('/api/solana/tx/withdraw').send(body);
      expectDenied(res);
    }
    expectNoSignerOrBroadcast();
  });
});

describe('GET /api/solana/tx/withdraw-capabilities', () => {
  it('reports withdraw as disabled even when a treasury key is configured', async () => {
    const res = await request(buildApp()).get('/api/solana/tx/withdraw-capabilities');

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.withdrawEnabled).toBe(false);
    // Diagnostics only parse the key; nothing is ever signed or sent.
    expect(txSign).not.toHaveBeenCalled();
    expect(sendRaw).not.toHaveBeenCalled();
  });
});
