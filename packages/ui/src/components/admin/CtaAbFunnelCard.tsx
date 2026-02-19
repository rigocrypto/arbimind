'use client';

import type { CtaAbReport } from '@/lib/adminApi';

interface CtaAbFunnelCardProps {
  report: CtaAbReport | null;
  range: '24h' | '7d' | '30d';
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function CtaAbFunnelCard({ report, range }: CtaAbFunnelCardProps) {
  if (!report) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-white">CTA A/B Funnel</h3>
        <p className="text-sm text-dark-400 mt-1">No analytics report available yet.</p>
      </div>
    );
  }

  const variantA = report.variants.find((v) => v.variant === 'A');
  const variantB = report.variants.find((v) => v.variant === 'B');
  const variants = [variantA, variantB].filter(Boolean);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">CTA A/B Funnel</h3>
          <p className="text-sm text-dark-400 mt-1">
            Landing → wallet connect conversion ({range})
          </p>
        </div>
        <div className="text-sm text-dark-300">
          Winner: <span className="text-white font-semibold">{report.winner ?? 'Tie'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {variants.map((variant) => (
          <div key={variant!.variant} className="rounded-lg border border-dark-600 bg-dark-800/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-dark-300">Variant {variant!.variant}</div>
              <div className="text-xs text-dark-400">{variant!.usesSessionIds ? 'session-based' : 'event-based'}</div>
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between text-dark-300">
                <span>Landings</span>
                <span className="text-white font-medium">{variant!.landings}</span>
              </div>
              <div className="flex items-center justify-between text-dark-300">
                <span>Connect clicks</span>
                <span className="text-white font-medium">{variant!.connectClicks}</span>
              </div>
              <div className="flex items-center justify-between text-dark-300">
                <span>Wallet connected</span>
                <span className="text-white font-medium">{variant!.walletConnected}</span>
              </div>
            </div>

            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-dark-400 uppercase tracking-wide">Connect rate</span>
                <span className="text-sm font-semibold text-green-400">{formatPct(variant!.connectRatePct)}</span>
              </div>
              <div className="h-2 rounded bg-dark-700 overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${Math.min(Math.max(variant!.connectRatePct, 0), 100)}%` }}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-dark-400">Bounce</span>
              <span className={variant!.bounceGuardrailBreached ? 'text-red-400 font-semibold' : 'text-dark-300'}>
                {formatPct(variant!.bounceRatePct)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-sm text-dark-300">
        Δ Connect rate (B - A): <span className={report.deltaConnectRatePct >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPct(report.deltaConnectRatePct)}</span>
      </div>
    </div>
  );
}
