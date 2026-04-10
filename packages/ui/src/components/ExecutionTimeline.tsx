'use client';

import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';

export type ExecutionTimelineStatus = 'idle' | 'running' | 'complete' | 'error';
export type ExecutionTimelineStep = 0 | 1 | 2 | 3 | 4;

interface ExecutionTimelineProps {
  currentStep: ExecutionTimelineStep;
  status: ExecutionTimelineStatus;
}

const STEPS = ['Scanning', 'Opportunity Found', 'Validating', 'Executing', 'Profit'] as const;

export function ExecutionTimeline({ currentStep, status }: ExecutionTimelineProps) {
  return (
    <section className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-dark-200">Execution Pipeline</h3>
        <span
          className={[
            'rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
            status === 'complete'
              ? 'border-green-400/40 bg-green-500/15 text-green-300'
              : status === 'error'
              ? 'border-red-400/40 bg-red-500/15 text-red-300'
              : status === 'running'
              ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
              : 'border-white/15 bg-white/5 text-dark-300',
          ].join(' ')}
        >
          {status}
        </span>
      </div>

      {/* Mobile: vertical step list */}
      <ol className="sm:hidden space-y-1.5">
        {STEPS.map((label, index) => {
          const isComplete = index < currentStep || status === 'complete';
          const isActive = index === currentStep && status === 'running';
          const isError = index === currentStep && status === 'error';
          return (
            <li key={label} className="flex items-center gap-2 text-xs">
              {isError ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-300" />
              ) : isComplete ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-300" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-dark-500" />
              )}
              <span
                className={[
                  isComplete
                    ? 'text-green-200'
                    : isActive
                    ? 'text-cyan-200 timeline-active-step'
                    : isError
                    ? 'text-red-200'
                    : 'text-dark-400',
                ].join(' ')}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Desktop: horizontal pipeline */}
      <div className="hidden overflow-x-auto sm:block">
        <ol className="flex min-w-[680px] items-center">
          {STEPS.map((label, index) => {
            const isComplete = index < currentStep || status === 'complete';
            const isActive = index === currentStep && status === 'running';
            const isError = index === currentStep && status === 'error';

            return (
              <li key={label} className="flex flex-1 items-center">
                <div className="flex items-center gap-2">
                  {isError ? (
                    <AlertTriangle className="h-4 w-4 text-red-300" />
                  ) : isComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-300" />
                  ) : (
                    <Circle className="h-4 w-4 text-dark-500" />
                  )}
                  <span
                    className={[
                      'text-sm',
                      isComplete
                        ? 'text-green-200'
                        : isActive
                        ? 'text-cyan-200 timeline-active-step'
                        : isError
                        ? 'text-red-200'
                        : 'text-dark-400',
                    ].join(' ')}
                  >
                    {label}
                  </span>
                </div>

                {index < STEPS.length - 1 && (
                  <div
                    className={[
                      'mx-2 h-[2px] flex-1 rounded-full',
                      isComplete
                        ? 'bg-green-400/60'
                        : isActive
                        ? 'bg-cyan-400/60 timeline-connector-active'
                        : 'bg-dark-700',
                    ].join(' ')}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
