/**
 * In-memory store for admin metrics and transactions.
 * Replace with Postgres/Supabase when ready.
 */

export interface AuditEvent {
  ts: number;
  type: 'admin_auth' | 'admin_action';
  ip: string;
  path: string;
  action?: string;
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface AdminTx {
  id: string;
  time: number;
  hash: string;
  strategy: string;
  status: 'success' | 'failed' | 'pending';
  grossProfit: number;
  netProfit: number;
  gasCost: number;
  blockNumber: number;
}

export interface PnlPoint {
  time: number;
  netProfit: number;
  grossProfit: number;
  gasCost: number;
}

const txs: AdminTx[] = [];
const pnlHistory: PnlPoint[] = [];
const auditEvents: AuditEvent[] = [];
const MAX_AUDIT = 500;
let enginePaused = false;

// Seed mock data for demo
function seedMock() {
  if (txs.length > 0) return;
  const now = Date.now();
  const strategies = ['arbitrage', 'trend', 'market-making'];
  for (let i = 24; i >= 0; i--) {
    const t = now - i * 3600 * 1000;
    const strat = strategies[i % 3] ?? 'arbitrage';
    const gross = 0.001 + Math.random() * 0.02;
    const gas = 0.0001 + Math.random() * 0.0005;
    const net = gross - gas;
    txs.push({
      id: `tx-${i}`,
      time: t,
      hash: `0x${Math.random().toString(16).slice(2, 66).padEnd(64, '0')}`,
      strategy: strat,
      status: Math.random() > 0.1 ? 'success' : 'failed',
      grossProfit: gross,
      netProfit: net,
      gasCost: gas,
      blockNumber: 18000000 + i,
    });
    pnlHistory.push({
      time: t,
      netProfit: (pnlHistory[pnlHistory.length - 1]?.netProfit ?? 0) + (Math.random() > 0.1 ? net : 0),
      grossProfit: (pnlHistory[pnlHistory.length - 1]?.grossProfit ?? 0) + gross,
      gasCost: (pnlHistory[pnlHistory.length - 1]?.gasCost ?? 0) + gas,
    });
  }
}
seedMock();

export const adminStore = {
  getTxs(): AdminTx[] {
    return [...txs];
  },
  addTx(tx: Omit<AdminTx, 'id'>): void {
    txs.unshift({
      ...tx,
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    });
    if (txs.length > 500) txs.pop();
  },
  getPnlHistory(): PnlPoint[] {
    return [...pnlHistory];
  },
  addPnlPoint(point: PnlPoint): void {
    pnlHistory.push(point);
    if (pnlHistory.length > 1000) pnlHistory.shift();
  },
  isEnginePaused(): boolean {
    return enginePaused;
  },
  setEnginePaused(paused: boolean): void {
    enginePaused = paused;
  },
  addAuditEvent(event: Omit<AuditEvent, 'ts'>): void {
    auditEvents.unshift({ ...event, ts: Date.now() });
    if (auditEvents.length > MAX_AUDIT) auditEvents.pop();
  },
  getAuditEvents(limit = 100): AuditEvent[] {
    return auditEvents.slice(0, limit);
  },
};
