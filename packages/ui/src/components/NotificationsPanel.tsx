'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Wallet, X } from 'lucide-react';

export type NotificationType = 'opportunity_found' | 'trade_executed' | 'slippage_warning' | 'low_balance';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  ttlMs?: number;
}

interface NotificationsPanelProps {
  open: boolean;
  items: NotificationItem[];
  onClose: () => void;
  onDismiss: (id: string) => void;
}

function iconForType(type: NotificationType) {
  switch (type) {
    case 'trade_executed':
      return <CheckCircle2 className="h-4 w-4 text-green-300" />;
    case 'slippage_warning':
      return <AlertTriangle className="h-4 w-4 text-amber-300" />;
    case 'low_balance':
      return <Wallet className="h-4 w-4 text-red-300" />;
    default:
      return <BellRing className="h-4 w-4 text-cyan-300" />;
  }
}

function widthClass(value: number) {
  const bucket = Math.round(Math.max(0, Math.min(100, value)) / 5) * 5;
  const classes: Record<number, string> = {
    0: 'w-0',
    5: 'w-[5%]',
    10: 'w-[10%]',
    15: 'w-[15%]',
    20: 'w-[20%]',
    25: 'w-[25%]',
    30: 'w-[30%]',
    35: 'w-[35%]',
    40: 'w-[40%]',
    45: 'w-[45%]',
    50: 'w-[50%]',
    55: 'w-[55%]',
    60: 'w-[60%]',
    65: 'w-[65%]',
    70: 'w-[70%]',
    75: 'w-[75%]',
    80: 'w-[80%]',
    85: 'w-[85%]',
    90: 'w-[90%]',
    95: 'w-[95%]',
    100: 'w-full',
  };
  return classes[bucket] ?? 'w-0';
}

function formatRelativeLabel(now: number, timestamp: number) {
  const diffSec = Math.max(1, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

export function NotificationsPanel({ open, items, onClose, onDismiss }: NotificationsPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const visibleItems = useMemo(() => items.slice(0, 5), [items]);

  useEffect(() => {
    if (!open || visibleItems.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [open, visibleItems.length]);

  useEffect(() => {
    const timers = visibleItems.map((item) => {
      const ttl = item.ttlMs ?? 8000;
      const remaining = Math.max(0, item.timestamp + ttl - Date.now());
      return window.setTimeout(() => onDismiss(item.id), remaining);
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [onDismiss, visibleItems]);

  return (
    <aside
      className={[
        'fixed z-50 transition-transform duration-200',
        'left-0 right-0 bottom-0 md:left-auto md:right-4 md:bottom-4 md:top-20 md:w-[360px]',
        open ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-[120%]',
      ].join(' ')}
    >
      <div className="mx-2 mb-2 md:mx-0 md:mb-0 glass-card border-cyan-500/20 p-3 max-h-[60vh] overflow-y-auto">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Smart Notifications</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 p-1.5 text-dark-200 hover:bg-white/5"
            aria-label="Close notifications"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2">
          {visibleItems.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-dark-300">
              No notifications yet.
            </div>
          ) : (
            visibleItems.map((item) => {
              const ttl = item.ttlMs ?? 8000;
              const elapsed = Math.max(0, now - item.timestamp);
              const pct = Math.max(0, 100 - (elapsed / ttl) * 100);

              return (
                <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="inline-flex items-start gap-2">
                      {iconForType(item.type)}
                      <p className="text-sm text-dark-100 leading-5">{item.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDismiss(item.id)}
                      className="text-dark-400 hover:text-white"
                      aria-label="Dismiss notification"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-dark-400 mb-1">
                    <span className="uppercase tracking-wide">{item.type.replace('_', ' ')}</span>
                    <span>{formatRelativeLabel(now, item.timestamp)}</span>
                  </div>

                  <div className="h-1 rounded-full bg-dark-800 overflow-hidden">
                    <div
                      className={[
                        'h-full bg-gradient-to-r from-cyan-400/80 to-purple-400/70 transition-all duration-500',
                        widthClass(pct),
                      ].join(' ')}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
