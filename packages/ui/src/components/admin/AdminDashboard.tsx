'use client';

import { useState, useEffect, useCallback } from 'react';
import { WalletOverviewCard } from './WalletOverviewCard';
import { KpiCards } from './KpiCards';
import { AdminCharts } from './AdminCharts';
import { AdminTxTable } from './AdminTxTable';
import { AdminAuditLog } from './AdminAuditLog';
import { adminApi, getSnapshotsHealth, type AdminMetrics, type AdminTx, type AdminWallets } from '@/lib/adminApi';
import { Pause, Play, Database } from 'lucide-react';
import toast from 'react-hot-toast';

function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

type Range = '24h' | '7d' | '30d';

export function AdminDashboard() {
  const [range, setRange] = useState<Range>('24h');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [txs, setTxs] = useState<AdminTx[]>([]);
  const [wallets, setWallets] = useState<AdminWallets | null>(null);
  const [enginePaused, setEnginePaused] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategyFilter, setStrategyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [snapshotHealth, setSnapshotHealth] = useState<{
    evm: { lastOkAt: string | null; stale: boolean } | null;
    solana: { lastOkAt: string | null; stale: boolean } | null;
  }>({ evm: null, solana: null });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [mRes, tRes, wRes, eRes, evmHealth, solHealth] = await Promise.all([
      adminApi.getMetrics(range),
      adminApi.getTxs({ limit: 50 }),
      adminApi.getWallets(),
      adminApi.getEngineStatus(),
      getSnapshotsHealth('evm'),
      getSnapshotsHealth('solana'),
    ]);
    if (mRes.ok && mRes.data) setMetrics(mRes.data);
    else if (!mRes.ok) setError(mRes.error ?? 'Failed to fetch metrics');
    if (tRes.ok && tRes.data) setTxs(tRes.data.txs);
    if (wRes.ok && wRes.data) setWallets(wRes.data);
    if (eRes.ok && eRes.data) setEnginePaused(eRes.data.paused);
    setSnapshotHealth({
      evm: evmHealth ? { lastOkAt: evmHealth.lastOkAt, stale: evmHealth.stale } : null,
      solana: solHealth ? { lastOkAt: solHealth.lastOkAt, stale: solHealth.stale } : null,
    });
    setLoading(false);
  }, [range]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handlePause = async () => {
    const res = await adminApi.pauseEngine();
    if (res.ok) {
      setEnginePaused(true);
      toast.success('Engine paused');
    } else toast.error(res.error ?? 'Failed to pause');
  };

  const handleResume = async () => {
    const res = await adminApi.resumeEngine();
    if (res.ok) {
      setEnginePaused(false);
      toast.success('Engine resumed');
    } else toast.error(res.error ?? 'Failed to resume');
  };

  const txsByStrategy = (() => {
    const acc: Record<string, { profit: number; count: number }> = {};
    txs.filter((t) => t.status === 'success').forEach((t) => {
      if (!acc[t.strategy]) acc[t.strategy] = { profit: 0, count: 0 };
      acc[t.strategy]!.profit += t.netProfit;
      acc[t.strategy]!.count += 1;
    });
    return Object.entries(acc).map(([strategy, { profit }]) => ({ strategy, profit }));
  })();

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-dark-400">Loading admin dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-red-500/30">
        <div className="text-red-400 font-medium">Error: {error}</div>
        <button onClick={fetchAll} className="btn mt-4">
          Retry
        </button>
      </div>
    );
  }

  const m = metrics?.metrics;

  return (
    <div className="space-y-6">
      {/* Snapshots badge */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Snapshots</h2>
            <p className="text-sm text-dark-400">
              EVM: {snapshotHealth.evm ? formatTimeAgo(snapshotHealth.evm.lastOkAt) : '—'}
              {snapshotHealth.evm?.stale && (
                <span className="ml-1.5 inline-flex items-center rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-400">
                  stale
                </span>
              )}
              {' · '}
              Solana: {snapshotHealth.solana ? formatTimeAgo(snapshotHealth.solana.lastOkAt) : '—'}
              {snapshotHealth.solana?.stale && (
                <span className="ml-1.5 inline-flex items-center rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-400">
                  stale
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Engine controls */}
      <div className="card flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Engine Control</h2>
          <p className="text-sm text-dark-400 mt-1">
            {enginePaused === true ? 'Engine is paused' : enginePaused === false ? 'Engine is running' : '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePause}
            disabled={enginePaused === true}
            className="btn flex items-center gap-2 disabled:opacity-50"
          >
            <Pause className="w-4 h-4" /> Pause
          </button>
          <button
            onClick={handleResume}
            disabled={enginePaused === false}
            className="btn btn-success flex items-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> Resume
          </button>
        </div>
      </div>

      {/* Range tabs */}
      <div className="flex gap-2">
        {(['24h', '7d', '30d'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              range === r ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-dark-800 text-dark-400 hover:text-white'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Wallets */}
      {wallets && (
        <WalletOverviewCard
          execution={wallets.wallets.execution}
          treasury={wallets.wallets.treasury}
          lastUpdated={new Date().toISOString()}
        />
      )}

      {/* KPIs */}
      {m && (
        <KpiCards
          netProfit={m.netProfit24h}
          grossProfit={m.grossProfit}
          gasSpend={m.gasSpend}
          winRate={m.winRate}
          failedTxCount={m.failedTxCount}
          txCount={m.txCount}
        />
      )}

      {/* Charts */}
      {m && (
        <AdminCharts
          pnlSeries={m.pnlSeries}
          txsByStrategy={txsByStrategy.length ? txsByStrategy : [{ strategy: 'arbitrage', profit: 0.01 }]}
          range={range}
        />
      )}

      {/* Tx table */}
      <AdminTxTable
        txs={txs}
        strategyFilter={strategyFilter}
        statusFilter={statusFilter}
        onStrategyFilterChange={setStrategyFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {/* Audit log */}
      <AdminAuditLog limit={100} />
    </div>
  );
}
