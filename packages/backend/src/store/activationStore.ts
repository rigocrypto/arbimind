import { Pool } from 'pg';

export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface ActivationRecord {
  wallet: string;
  plan: string;
  capital: number;
  risk: string;
  speed: string;
  sessionToken: string;
  paymentStatus: PaymentStatus;
  botActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertActivationInput {
  wallet: string;
  plan: string;
  capital: number;
  risk: string;
  speed: string;
  sessionToken: string;
}

let pool: Pool | null = null;
let initialized = false;

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 3 });
  }
  return pool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS activations (
  id serial PRIMARY KEY,
  wallet text NOT NULL UNIQUE,
  plan text NOT NULL,
  capital integer,
  risk text,
  speed text,
  session_token text NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending',
  bot_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activations_payment_status
ON activations (payment_status, updated_at DESC);
`;

export async function initActivationSchema(): Promise<void> {
  const p = getPool();
  if (!p || initialized) return;

  try {
    await p.query(SCHEMA_SQL);
    initialized = true;
  } catch (error) {
    console.error('[ACTIVATION-STORE] Schema init failed:', error);
  }
}

function rowToRecord(row: {
  wallet: string;
  plan: string;
  capital: number;
  risk: string;
  speed: string;
  session_token: string;
  payment_status: string;
  bot_active: boolean;
  created_at: Date;
  updated_at: Date;
}): ActivationRecord {
  const normalizedStatus = row.payment_status === 'paid' || row.payment_status === 'failed'
    ? row.payment_status
    : 'pending';

  return {
    wallet: row.wallet,
    plan: row.plan,
    capital: Number(row.capital),
    risk: row.risk,
    speed: row.speed,
    sessionToken: row.session_token,
    paymentStatus: normalizedStatus,
    botActive: Boolean(row.bot_active),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function upsertActivation(input: UpsertActivationInput): Promise<ActivationRecord | null> {
  const p = getPool();
  if (!p) {
    const now = new Date().toISOString();
    return {
      wallet: input.wallet,
      plan: input.plan,
      capital: input.capital,
      risk: input.risk,
      speed: input.speed,
      sessionToken: input.sessionToken,
      paymentStatus: 'pending',
      botActive: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  await initActivationSchema();

  try {
    const { rows } = await p.query<{
      wallet: string;
      plan: string;
      capital: number;
      risk: string;
      speed: string;
      session_token: string;
      payment_status: string;
      bot_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO activations (wallet, plan, capital, risk, speed, session_token, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (wallet) DO UPDATE SET
         plan = EXCLUDED.plan,
         capital = EXCLUDED.capital,
         risk = EXCLUDED.risk,
         speed = EXCLUDED.speed,
         session_token = EXCLUDED.session_token,
         updated_at = now()
       RETURNING wallet, plan, capital, risk, speed, session_token, payment_status, bot_active, created_at, updated_at`,
      [input.wallet, input.plan, input.capital, input.risk, input.speed, input.sessionToken]
    );

    const row = rows[0];
    if (!row) return null;
    return rowToRecord(row);
  } catch (error) {
    console.error('[ACTIVATION-STORE] upsertActivation error:', error);
    return null;
  }
}

export async function getActivationByWallet(wallet: string): Promise<ActivationRecord | null> {
  const p = getPool();
  if (!p) return null;

  await initActivationSchema();

  try {
    const { rows } = await p.query<{
      wallet: string;
      plan: string;
      capital: number;
      risk: string;
      speed: string;
      session_token: string;
      payment_status: string;
      bot_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT wallet, plan, capital, risk, speed, session_token, payment_status, bot_active, created_at, updated_at
       FROM activations
       WHERE wallet = $1`,
      [wallet]
    );

    const row = rows[0];
    if (!row) return null;
    return rowToRecord(row);
  } catch (error) {
    console.error('[ACTIVATION-STORE] getActivationByWallet error:', error);
    return null;
  }
}

export async function confirmActivationPayment(wallet: string): Promise<ActivationRecord | null> {
  const p = getPool();
  if (!p) return null;

  await initActivationSchema();

  try {
    const { rows } = await p.query<{
      wallet: string;
      plan: string;
      capital: number;
      risk: string;
      speed: string;
      session_token: string;
      payment_status: string;
      bot_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE activations
       SET payment_status = 'paid',
           bot_active = true,
           updated_at = now()
       WHERE wallet = $1
       RETURNING wallet, plan, capital, risk, speed, session_token, payment_status, bot_active, created_at, updated_at`,
      [wallet]
    );

    const row = rows[0];
    if (!row) return null;
    return rowToRecord(row);
  } catch (error) {
    console.error('[ACTIVATION-STORE] confirmActivationPayment error:', error);
    return null;
  }
}
