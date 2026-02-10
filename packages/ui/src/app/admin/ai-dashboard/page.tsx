'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import type { AIDexPairResponse, AIPredictionAccuracyRow, AIPredictionRow } from '@/lib/adminApi';
import { adminApi, hasAdminKey } from '@/lib/adminApi';
import { PairSearch } from './components/PairSearch';
import { MetricsGrid } from './components/MetricsGrid';
import { AccuracyCards } from './components/AccuracyCards';
import { HitRateChart } from './components/HitRateChart';
import { AvgReturnChart } from './components/AvgReturnChart';

export default function AIDashboardPage() {
  const [pair, setPair] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AIDexPairResponse | null>(null);
  const [window, setWindow] = useState<'6h' | '24h' | '7d'>('6h');
  const [historyPoints, setHistoryPoints] = useState<Array<{ ts: number; priceUsd?: number; liquidityUsd?: number; volumeH24?: number; buysH1?: number; sellsH1?: number }>>([]);
  const [historyMeta, setHistoryMeta] = useState<{ returnedPoints: number; totalPointsForPair: number; samplingSeconds: number; retentionHours: number; newestTs?: number; oldestTs?: number } | null>(null);
  const [lastLiveFetchAt, setLastLiveFetchAt] = useState<number | null>(null);
  const [predictions, setPredictions] = useState<AIPredictionRow[]>([]);
  const [accuracyRows, setAccuracyRows] = useState<AIPredictionAccuracyRow[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [devSignal, setDevSignal] = useState<'LONG' | 'SHORT' | 'NEUTRAL'>('NEUTRAL');
  const [devConfidence, setDevConfidence] = useState('0.7');
  const [devModel, setDevModel] = useState('dev-model');
  const [devHorizon, setDevHorizon] = useState('900');

  const authed = useMemo(() => hasAdminKey(), []);

  const handleLoad = async (pairAddress: string) => {
    if (!authed || !pairAddress) return;
    setLoading(true);
    setError(null);
    setPair(pairAddress);

    const historyRes = await adminApi.getAIDexHistory(pairAddress, window);
    if (!historyRes.ok) {
      setError(historyRes.error ?? 'Failed to load history');
      setHistoryPoints([]);
      setHistoryMeta(null);
    } else {
      setHistoryPoints(historyRes.data?.points ?? []);
      setHistoryMeta(historyRes.data?.meta ?? null);
    }

    const res = await adminApi.getAIDexPair(pairAddress);
    if (!res.ok) {
      setError(res.error ?? 'Failed to load pair');
      setData(null);
    } else {
      setData(res.data);
      setLastLiveFetchAt(Date.now());
    }

    const predRes = await adminApi.getAIPredictions(pairAddress, window, 200);
    if (predRes.ok) setPredictions(predRes.data?.rows ?? []);

    const accRes = await adminApi.getAIPredictionAccuracy(pairAddress, window);
    if (accRes.ok) setAccuracyRows(accRes.data?.rows ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!authed || !pair.trim()) return;
    const interval = setInterval(async () => {
      const res = await adminApi.getAIDexPair(pair.trim());
      if (!res.ok || !res.data?.pair) return;
      setData(res.data);
      setLastLiveFetchAt(Date.now());

      const now = Date.now();
      const nextPoint = {
        ts: now,
        priceUsd: Number(res.data.pair.priceUsd ?? 0),
        liquidityUsd: Number(res.data.pair.liquidity?.usd ?? 0),
        volumeH24: Number(res.data.pair.volume?.h24 ?? 0),
        buysH1: Number(res.data.pair.txns?.h1?.buys ?? 0),
        sellsH1: Number(res.data.pair.txns?.h1?.sells ?? 0),
      };

      setHistoryPoints((prev) => {
        const windowMs = window === '6h' ? 6 * 60 * 60 * 1000 : window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        const trimmed = prev.filter((pt) => pt.ts >= now - windowMs);
        const last = trimmed[trimmed.length - 1];
        if (last && Math.abs(nextPoint.ts - last.ts) < 20000) {
          return [...trimmed.slice(0, -1), nextPoint];
        }
        return [...trimmed, nextPoint];
      });

      const predRes = await adminApi.getAIPredictions(pair.trim(), window, 200);
      if (predRes.ok) setPredictions(predRes.data?.rows ?? []);

      const accRes = await adminApi.getAIPredictionAccuracy(pair.trim(), window);
      if (accRes.ok) setAccuracyRows(accRes.data?.rows ?? []);
    }, 20000);

    return () => clearInterval(interval);
  }, [authed, pair, window]);

  const priceUsd = Number(data?.pair?.priceUsd ?? 0);
  const liquidityUsd = Number(data?.pair?.liquidity?.usd ?? 0);

  const priceSeries = useMemo(() => {
    return historyPoints.map((pt) => ({
      name: new Date(pt.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      priceUsd: Number(pt.priceUsd ?? 0),
    }));
  }, [historyPoints]);

  const latestPointTs = historyPoints[historyPoints.length - 1]?.ts;

  const normalizedAccuracyRows = useMemo(() => {
    return accuracyRows
      .map((row) => {
        const horizonSec = Number(row.horizon_sec ?? row.horizonSec ?? 0);
        const model = String(row.model ?? 'default');
        const total = Number(row.total ?? 0);
        const resolved = Number(row.resolved ?? 0);
        const hitRateRaw = row.hit_rate ?? row.hitRate ?? null;
        const avgReturnRaw = row.avg_return_pct ?? row.avg_return ?? row.avgReturnPct ?? null;
        const medianReturnRaw = row.median_return_pct ?? row.medianReturnPct ?? null;

        return {
          horizonSec,
          model,
          total,
          resolved,
          hitRate: hitRateRaw != null ? Number(hitRateRaw) : null,
          avgReturnPct: avgReturnRaw != null ? Number(avgReturnRaw) : null,
          medianReturnPct: medianReturnRaw != null ? Number(medianReturnRaw) : null,
        };
      })
      .filter((row) => row.horizonSec > 0);
  }, [accuracyRows]);

  const accuracyModels = useMemo(() => {
    return Array.from(new Set(normalizedAccuracyRows.map((row) => row.model))).sort();
  }, [normalizedAccuracyRows]);

  const hitRateChartData = useMemo(() => {
    const byHorizon = new Map<number, Record<string, number | string | null>>();
    normalizedAccuracyRows.forEach((row) => {
      const entry = byHorizon.get(row.horizonSec) ?? { horizon: `${row.horizonSec}s` };
      entry[row.model] = row.hitRate != null ? Number(row.hitRate) * 100 : null;
      byHorizon.set(row.horizonSec, entry);
    });
    return Array.from(byHorizon.entries())
      .sort(([a], [b]) => a - b)
      .map(([, value]) => value);
  }, [normalizedAccuracyRows]);

  const avgReturnChartData = useMemo(() => {
    const byHorizon = new Map<number, Record<string, number | string | null>>();
    const medianByHorizon = new Map<number, { sum: number; weight: number }>();

    normalizedAccuracyRows.forEach((row) => {
      const entry = byHorizon.get(row.horizonSec) ?? { horizon: `${row.horizonSec}s` };
      entry[row.model] = row.avgReturnPct != null ? Number(row.avgReturnPct) : null;
      byHorizon.set(row.horizonSec, entry);

      if (row.medianReturnPct != null && row.resolved > 0) {
        const bucket = medianByHorizon.get(row.horizonSec) ?? { sum: 0, weight: 0 };
        bucket.sum += row.medianReturnPct * row.resolved;
        bucket.weight += row.resolved;
        medianByHorizon.set(row.horizonSec, bucket);
      }
    });

    return Array.from(byHorizon.entries())
      .sort(([a], [b]) => a - b)
      .map(([horizonSec, value]) => {
        const median = medianByHorizon.get(horizonSec);
        return {
          ...value,
          medianReturnPct: median && median.weight > 0 ? median.sum / median.weight : null,
        };
      });
  }, [normalizedAccuracyRows]);

  const handleEvaluate = async () => {
    if (!pair) return;
    setEvaluating(true);
    await adminApi.evaluateAIPredictions(pair);
    const predRes = await adminApi.getAIPredictions(pair, window, 200);
    if (predRes.ok) setPredictions(predRes.data?.rows ?? []);
    const accRes = await adminApi.getAIPredictionAccuracy(pair, window);
    if (accRes.ok) setAccuracyRows(accRes.data?.rows ?? []);
    setEvaluating(false);
  };

  const handleDevLog = async () => {
    if (!pair) return;
    await adminApi.createAIPrediction({
      pairAddress: pair,
      chain: 'solana',
      horizonSec: Number(devHorizon) || 900,
      model: devModel,
      signal: devSignal,
      confidence: Number(devConfidence) || 0,
      reason: 'dev_manual',
      alertContext: { source: 'manual' },
    });
    const predRes = await adminApi.getAIPredictions(pair, window, 200);
    if (predRes.ok) setPredictions(predRes.data?.rows ?? []);
  };

  const volumeSeries = useMemo(() => {
    return historyPoints.map((pt) => ({
      name: new Date(pt.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      volume: Number(pt.volumeH24 ?? 0),
    }));
  }, [historyPoints]);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Monitoring Dashboard</h1>
          <p className="text-sm text-dark-400">DexScreener live metrics + AI alert flags</p>
        </div>
        <Link href="/admin" className="btn btn-ghost text-dark-300 hover:text-white">
          Back to Admin
        </Link>
      </div>

      {!authed && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-2">Admin key required</h2>
          <p className="text-sm text-dark-400 mb-4">Please authenticate on the Admin page first.</p>
          <Link href="/admin" className="btn-primary">Go to Admin Login</Link>
        </div>
      )}

      {authed && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <PairSearch defaultValue={pair} onSubmit={handleLoad} loading={loading} />
            </div>
            <div className="card sm:w-48">
              <label className="block text-sm font-medium text-dark-300 mb-2">Window</label>
              <select
                value={window}
                onChange={(e) => setWindow(e.target.value as '6h' | '24h' | '7d')}
                className="input-field w-full"
              >
                <option value="6h">6h</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}

          {pair && (
            <div className="text-xs text-dark-500">
              Window: {window}
              {historyMeta ? ` · Points: ${historyMeta.returnedPoints}/${historyMeta.totalPointsForPair}` : ` · Points: ${historyPoints.length}`}
              {historyMeta ? ` · Sampling: ${historyMeta.samplingSeconds}s` : ' · Sampling: ~20s'}
              {historyMeta ? ` · Retention: ${historyMeta.retentionHours}h` : ''}
              {lastLiveFetchAt ? ` · Last updated: ${new Date(lastLiveFetchAt).toLocaleTimeString()}` : ''}
              {latestPointTs ? ` · Latest point: ${new Date(latestPointTs).toLocaleTimeString()}` : ''}
            </div>
          )}

          {loading && (
            <div className="card animate-pulse">
              <div className="h-6 w-40 bg-dark-700 rounded mb-3" />
              <div className="h-4 w-64 bg-dark-700 rounded" />
            </div>
          )}

          {data?.pair && (
            <MetricsGrid
              priceSeries={priceSeries}
              volumeSeries={volumeSeries}
              liquidityUsd={liquidityUsd}
              priceUsd={priceUsd}
              alerts={data.alerts}
            />
          )}

          {pair && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">Accuracy</h3>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={handleEvaluate}
                  disabled={evaluating}
                >
                  {evaluating ? 'Evaluating…' : 'Evaluate due'}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <AccuracyCards rows={normalizedAccuracyRows} />
                <HitRateChart data={hitRateChartData} models={accuracyModels} />
                <AvgReturnChart data={avgReturnChartData} models={accuracyModels} />
              </div>

              <div className="card">
                <h3 className="text-white font-semibold mb-3">Recent Predictions</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="text-dark-400 border-b border-dark-700">
                        <th className="text-left py-2">Time</th>
                        <th className="text-left py-2">Signal</th>
                        <th className="text-right py-2">Confidence</th>
                        <th className="text-right py-2">Entry</th>
                        <th className="text-right py-2">Return %</th>
                        <th className="text-right py-2">Correct</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predictions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-dark-500">No predictions logged.</td>
                        </tr>
                      )}
                      {predictions.map((row) => (
                        <tr key={row.id} className="border-b border-dark-800">
                          <td className="py-2 text-dark-300">{row.createdAt ? new Date(row.createdAt).toLocaleTimeString() : '—'}</td>
                          <td className="py-2 text-white">{row.signal ?? '—'}</td>
                          <td className="py-2 text-right text-white">{row.confidence != null ? Number(row.confidence).toFixed(2) : '—'}</td>
                          <td className="py-2 text-right text-white">{row.entryPriceUsd != null ? Number(row.entryPriceUsd).toFixed(6) : '—'}</td>
                          <td className={`py-2 text-right ${row.returnPct != null && Number(row.returnPct) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {row.returnPct != null ? Number(row.returnPct).toFixed(2) : '—'}
                          </td>
                          <td className="py-2 text-right text-white">{row.correct == null ? '—' : row.correct ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {process.env.NODE_ENV !== 'production' && pair && (
            <div className="card">
              <button
                type="button"
                className="btn btn-ghost text-sm"
                onClick={() => setDevOpen((v) => !v)}
              >
                {devOpen ? 'Hide' : 'Show'} Dev tools
              </button>
              {devOpen && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Signal</label>
                    <select
                      className="input-field w-full"
                      value={devSignal}
                      onChange={(e) => setDevSignal(e.target.value as 'LONG' | 'SHORT' | 'NEUTRAL')}
                    >
                      <option value="LONG">LONG</option>
                      <option value="SHORT">SHORT</option>
                      <option value="NEUTRAL">NEUTRAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Confidence</label>
                    <input
                      className="input-field w-full"
                      value={devConfidence}
                      onChange={(e) => setDevConfidence(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Model</label>
                    <input
                      className="input-field w-full"
                      value={devModel}
                      onChange={(e) => setDevModel(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">Horizon (sec)</label>
                    <input
                      className="input-field w-full"
                      value={devHorizon}
                      onChange={(e) => setDevHorizon(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <button className="btn-primary" type="button" onClick={handleDevLog}>
                      Log prediction
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
