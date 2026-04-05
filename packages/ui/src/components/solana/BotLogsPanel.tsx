'use client';

import { useRef, useEffect, useState } from 'react';
import type { LogEntry } from './BotControlPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info: 'text-cyan-300',
  warn: 'text-yellow-300',
  error: 'text-red-400',
};

const LEVEL_PREFIX: Record<LogEntry['level'], string> = {
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

type LevelFilter = 'all' | 'info' | 'warn' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BotLogsPanelProps {
  logs: LogEntry[];
}

export function BotLogsPanel({ logs }: BotLogsPanelProps) {
  const [filter, setFilter] = useState<LevelFilter>('all');
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  // Auto-scroll to bottom unless paused
  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, paused]);

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-dark-100">Bot Logs</h3>
        <div className="flex items-center gap-1.5">
          {(['all', 'info', 'warn', 'error'] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setFilter(level)}
              className={`px-2 py-0.5 text-[10px] rounded font-medium transition ${
                filter === level
                  ? 'bg-dark-600 text-dark-100'
                  : 'text-dark-500 hover:text-dark-300'
              }`}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal-style log viewer */}
      <div
        ref={scrollRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="bg-dark-900 rounded-lg border border-dark-700 font-mono text-[11px] leading-relaxed p-3 max-h-64 overflow-y-auto"
      >
        {filtered.length === 0 ? (
          <p className="text-dark-600 text-center py-4">No logs yet.</p>
        ) : (
          filtered.map((entry, i) => {
            const ts = new Date(entry.ts).toLocaleTimeString();
            return (
              <div key={`${entry.ts}-${i}`} className="flex gap-2 hover:bg-dark-800/40 px-1 -mx-1 rounded">
                <span className="text-dark-600 shrink-0">{ts}</span>
                <span className={`shrink-0 font-bold ${LEVEL_COLORS[entry.level]}`}>
                  [{LEVEL_PREFIX[entry.level]}]
                </span>
                <span className="text-dark-200 break-all">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-dark-500">
        <span>{filtered.length} entries</span>
        {paused && (
          <span className="text-yellow-400">⏸ Auto-scroll paused (hover)</span>
        )}
      </div>
    </div>
  );
}
