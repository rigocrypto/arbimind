export type EngineEventLevel = 'info' | 'warn' | 'error';

export interface EngineEvent {
  id: string;
  ts: number;
  level: EngineEventLevel;
  type: string;
  msg: string;
  strategyId?: string;
  txSig?: string;
  meta?: Record<string, unknown>;
}

interface EmitEngineEventInput {
  level: EngineEventLevel;
  type: string;
  msg: string;
  strategyId?: string;
  txSig?: string;
  meta?: Record<string, unknown>;
}

const MAX_EVENTS = 500;
const events: EngineEvent[] = [];
let sequence = 0;

export function emitEngineEvent(input: EmitEngineEventInput): EngineEvent {
  const ts = Date.now();
  sequence += 1;

  const event: EngineEvent = {
    id: `${ts}-${sequence}`,
    ts,
    level: input.level,
    type: input.type,
    msg: input.msg,
    ...(input.strategyId ? { strategyId: input.strategyId } : {}),
    ...(input.txSig ? { txSig: input.txSig } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  };

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  return event;
}

export function getEngineEvents(options?: { since?: number; limit?: number }): EngineEvent[] {
  const since = Number.isFinite(options?.since) ? Number(options?.since) : 0;
  const limitRaw = Number.isFinite(options?.limit) ? Number(options?.limit) : 100;
  const limit = Math.max(1, Math.min(500, Math.floor(limitRaw)));

  const filtered = since > 0 ? events.filter((event) => event.ts > since) : events;
  if (filtered.length <= limit) {
    return [...filtered];
  }

  return filtered.slice(filtered.length - limit);
}