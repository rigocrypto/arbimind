export type Chain = 'EVM' | 'SOL';

export type FeedMode = 'TRADER' | 'OPERATOR';
export type FeedSource = 'DEMO' | 'LIVE';

export type OpportunityStatus =
  | 'READY'
  | 'NEEDS_APPROVAL'
  | 'LOW_BALANCE'
  | 'HIGH_RISK'
  | 'STALE';

export type Opportunity = {
  id: string;
  chain: Chain;
  ts: number;
  routeId: string;
  routeLabel: string;
  venues: string[];
  tokens: {
    in: string;
    out: string;
    mid?: string[];
  };
  size: {
    min: number;
    max: number;
    unit: string;
  };
  profit: {
    grossUsd: number;
    feesUsd: number;
    gasUsd?: number;
    priorityFeeUsd?: number;
    slippageUsd: number;
    netUsd: number;
    netBps: number;
  };
  scores: {
    confidence: number;
    mevRisk?: number;
    volatilityRisk?: number;
    execProbability?: number;
  };
  status: OpportunityStatus;
  reasons?: string[];
};
