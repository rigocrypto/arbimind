'use client';

import { AlertTriangle } from 'lucide-react';

interface AlertsBadgesProps {
  alerts?: { volumeSpike?: boolean; txSpike?: boolean };
}

export function AlertsBadges({ alerts }: AlertsBadgesProps) {
  const items = [
    { key: 'volumeSpike', label: 'Volume Spike', active: !!alerts?.volumeSpike },
    { key: 'txSpike', label: 'Tx Spike', active: !!alerts?.txSpike },
  ];

  return (
    <div className="card">
      <div className="flex items-center gap-2 text-white font-semibold mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        AI Alerts
      </div>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <span
            key={item.key}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${item.active ? 'bg-amber-500/20 text-amber-300' : 'bg-dark-700 text-dark-300'}`}
            title={item.active ? `${item.label} active` : `${item.label} inactive`}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
