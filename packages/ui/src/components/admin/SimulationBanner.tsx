'use client';

import { AlertTriangle } from 'lucide-react';

interface SimulationBannerProps {
  isSimulated: boolean | null;
}

export function SimulationBanner({ isSimulated }: SimulationBannerProps) {
  if (isSimulated === false) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300">
      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
      <div>
        <p className="font-medium text-sm">
          {isSimulated === true
            ? '⚠️ Simulation Mode — data may not reflect real execution'
            : '⚠️ Engine mode unknown — SIMULATED_ENGINE_ENABLED not confirmed'}
        </p>
        <p className="text-xs text-amber-300/70 mt-0.5">
          Profit figures and transactions shown below may be from the simulated engine.
        </p>
      </div>
    </div>
  );
}
