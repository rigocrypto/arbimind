'use client';

import { useState } from 'react';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import toast from 'react-hot-toast';

interface EmergencyStopButtonProps {
  onStopped: () => void;
}

export function EmergencyStopButton({ onStopped }: EmergencyStopButtonProps) {
  const [stopping, setStopping] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleStop = async () => {
    setStopping(true);
    const res = await adminApi.emergencyStop();
    setStopping(false);
    setShowConfirm(false);
    if (res.ok) {
      toast.success('Engine emergency stopped');
      onStopped();
    } else {
      toast.error(res.error ?? 'Failed to stop engine');
    }
  };

  if (showConfirm) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <AlertOctagon className="w-6 h-6 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">Confirm Emergency Stop</p>
            <p className="text-xs text-red-300/70">
              This will immediately stop the engine and halt all execution.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleStop}
            disabled={stopping}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertOctagon className="w-4 h-4" />}
            Yes, Stop Engine
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            disabled={stopping}
            className="btn text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition"
    >
      <AlertOctagon className="w-4 h-4" />
      EMERGENCY STOP
    </button>
  );
}
