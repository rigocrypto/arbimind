import { useMutation } from '@tanstack/react-query';
import type { Opportunity } from '@/lib/feed/types';

export type SimulationLeg = {
  venue: string;
  direction: string;
  inToken: string;
  outToken: string;
  inAmount: number;
  outAmount: number;
  priceImpact: string;
};

export type SimulationResult = {
  routeId: string;
  cluster: string;
  inputAmount: number;
  outputAmount: number;
  netProfit: number;
  netBps: number;
  legs: SimulationLeg[];
  estimatedFees: number;
  willRevert: boolean;
  revertReason: string | null;
  quotedAt: number;
};

export function useSimulation() {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  return useMutation<
    SimulationResult,
    Error,
    { opportunity: Opportunity; amount: number }
  >({
    mutationFn: async ({ opportunity, amount }) => {
      const res = await fetch(`${API_BASE}/opportunities/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: opportunity.routeId,
          amount,
          cluster: opportunity.chain === 'SOL' ? 'mainnet-beta' : undefined,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Simulation failed');
      }

      return data.simulation;
    },
  });
}
