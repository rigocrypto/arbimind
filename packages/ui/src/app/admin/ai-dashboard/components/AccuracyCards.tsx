'use client';

interface AccuracyRow {
  horizonSec: number;
  model: string;
  total: number;
  resolved: number;
  hitRate: number | null;
  avgReturnPct: number | null;
  medianReturnPct?: number | null;
}

interface AccuracyCardsProps {
  rows: AccuracyRow[];
}

export function AccuracyCards({ rows }: AccuracyCardsProps) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.total += row.total;
      acc.resolved += row.resolved;
      if (row.hitRate != null && row.resolved > 0) {
        acc.correct += row.hitRate * row.resolved;
      }
      if (row.avgReturnPct != null && row.resolved > 0) {
        acc.avgReturn += row.avgReturnPct * row.resolved;
      }
      if (row.medianReturnPct != null && row.resolved > 0) {
        acc.medianReturn += row.medianReturnPct * row.resolved;
        acc.medianWeight += row.resolved;
      }
      return acc;
    },
    { total: 0, resolved: 0, correct: 0, avgReturn: 0, medianReturn: 0, medianWeight: 0 }
  );

  const overallHitRate = totals.resolved > 0 ? totals.correct / totals.resolved : null;
  const overallAvgReturn = totals.resolved > 0 ? totals.avgReturn / totals.resolved : null;
  const overallMedianReturn = totals.medianWeight > 0 ? totals.medianReturn / totals.medianWeight : null;

  return (
    <div className="card">
      <div className="text-white font-semibold mb-4">Accuracy summary</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-dark-400">Overall hit rate</div>
          <div className="text-xl font-semibold text-white">
            {overallHitRate == null ? '—' : `${(overallHitRate * 100).toFixed(1)}%`}
          </div>
        </div>
        <div>
          <div className="text-xs text-dark-400">Avg return</div>
          <div className={`text-xl font-semibold ${overallAvgReturn != null && overallAvgReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {overallAvgReturn == null ? '—' : `${overallAvgReturn.toFixed(2)}%`}
          </div>
        </div>
        <div>
          <div className="text-xs text-dark-400">Resolved / total</div>
          <div className="text-xl font-semibold text-white">
            {totals.resolved}/{totals.total}
          </div>
        </div>
      </div>

      {overallMedianReturn != null && (
        <div className="mt-4 text-xs text-dark-400">
          Median return (weighted): <span className="text-white">{overallMedianReturn.toFixed(2)}%</span>
        </div>
      )}
      <div className="mt-2 text-xs text-dark-500">
        Resolved: {totals.resolved} / {totals.total}. Metrics exclude unresolved. Correct = direction matches realized return over the horizon.
      </div>
    </div>
  );
}
