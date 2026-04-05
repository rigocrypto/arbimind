'use client';

import type { QueueItem } from './BotControlPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spreadColor(bps: number): string {
  if (bps >= 20) return 'text-green-400';
  if (bps >= 10) return 'text-yellow-400';
  return 'text-dark-400';
}

function spreadBg(bps: number): string {
  if (bps >= 20) return 'border-green-500/20 bg-green-500/5';
  if (bps >= 10) return 'border-yellow-500/20 bg-yellow-500/5';
  return 'border-dark-700 bg-dark-800/50';
}

function confidenceBadge(c: 'high' | 'medium' | 'low') {
  const map = {
    high: 'bg-green-600/20 text-green-300',
    medium: 'bg-yellow-600/20 text-yellow-300',
    low: 'bg-dark-700 text-dark-400',
  } as const;
  return map[c];
}

function ageLabel(detectedAt: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - detectedAt) / 1000));
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function statusBadge(s: QueueItem['status']) {
  const map: Record<QueueItem['status'], string> = {
    detected: 'bg-blue-600/20 text-blue-300',
    executing: 'bg-orange-600/20 text-orange-300',
    completed: 'bg-green-600/20 text-green-300',
    skipped: 'bg-dark-700 text-dark-400',
  };
  return map[s];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OpportunityFeedProps {
  queue: QueueItem[];
  totalOpps: number;
  totalScans: number;
  lastScanMs: number;
}

export function OpportunityFeed({ queue, totalOpps, totalScans, lastScanMs }: OpportunityFeedProps) {
  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-dark-100">Opportunity Feed</h3>
        <span className="text-[10px] text-dark-500">
          {queue.length} queued
        </span>
      </div>

      {/* Aggregate stats row */}
      <div className="flex gap-3 text-[11px] text-dark-400">
        <span>Scans: <span className="text-dark-200 font-medium">{totalScans}</span></span>
        <span>Opps: <span className="text-dark-200 font-medium">{totalOpps}</span></span>
        <span>
          Last scan:{' '}
          <span className="text-dark-200 font-medium">
            {lastScanMs > 0 ? `${lastScanMs}ms` : '—'}
          </span>
        </span>
      </div>

      {/* Feed list */}
      {queue.length === 0 ? (
        <p className="text-xs text-dark-500 py-4 text-center">
          No opportunities detected yet. Start the scanner to begin.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {queue.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border px-3 py-2 text-xs ${spreadBg(item.spreadBps)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-dark-100">{item.pair}</span>
                  <span className={`font-mono font-medium ${spreadColor(item.spreadBps)}`}>
                    {item.spreadBps.toFixed(1)} bps
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${confidenceBadge(item.confidence)}`}>
                    {item.confidence}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge(item.status)}`}>
                    {item.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-1 text-dark-400">
                <span>
                  Est: <span className="text-dark-200">{item.expectedProfitSol.toFixed(6)} SOL</span>
                </span>
                <span className="text-dark-500">{ageLabel(item.detectedAt)}</span>
              </div>
              {item.route && (
                <div className="mt-1 text-dark-500 truncate text-[10px]">
                  Route: {item.route}
                </div>
              )}
              {item.result && (
                <div className={`mt-1 text-[10px] font-medium ${
                  item.result.pnlSol >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  Result: {item.result.pnlSol >= 0 ? '+' : ''}{item.result.pnlSol.toFixed(6)} SOL
                  {item.result.mode === 'live' && ' (LIVE)'}
                  {item.result.mode === 'paper' && ' (PAPER)'}
                  {item.result.error && (
                    <span className="text-red-400 ml-1">| {item.result.error}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
