'use client';

import { apiUrl } from '@/lib/apiConfig';

export type FunnelEventName =
  | 'landing_view'
  | 'wallet_connect_click'
  | 'wallet_connected'
  | 'first_opportunity_view'
  | 'canary_start_clicked';

export type CtaVariant = 'A' | 'B';

const CTA_VARIANT_KEY = 'arbimind_cta_variant_v1';
const SESSION_ID_KEY = 'arbimind_session_id_v1';

function canUseBrowserApis(): boolean {
  return typeof window !== 'undefined';
}

export function getPersistentCtaVariant(): CtaVariant {
  if (!canUseBrowserApis()) {
    return 'A';
  }

  const existing = window.localStorage.getItem(CTA_VARIANT_KEY);
  if (existing === 'A' || existing === 'B') {
    return existing;
  }

  const assigned: CtaVariant = Math.random() < 0.5 ? 'A' : 'B';
  window.localStorage.setItem(CTA_VARIANT_KEY, assigned);
  return assigned;
}

function getPersistentSessionId(): string {
  if (!canUseBrowserApis()) {
    return 'server';
  }

  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `sess_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

  window.sessionStorage.setItem(SESSION_ID_KEY, generated);
  return generated;
}

export function trackEvent(
  name: FunnelEventName,
  properties: Record<string, unknown> = {}
): void {
  if (!canUseBrowserApis()) {
    return;
  }

  const payload = {
    name,
    properties,
    ts: new Date().toISOString(),
    path: window.location.pathname,
    sessionId: getPersistentSessionId(),
  };

  const eventBus = (window as Window & {
    dataLayer?: Array<Record<string, unknown>>;
  }).dataLayer;

  if (Array.isArray(eventBus)) {
    eventBus.push({ event: name, ...payload });
  }

  void fetch(apiUrl('/analytics/events'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      properties,
      ts: payload.ts,
      path: payload.path,
      sessionId: payload.sessionId,
      ctaVariant: getPersistentCtaVariant(),
      source: 'ui',
    }),
    keepalive: true,
  }).catch(() => {});

  if (process.env.NODE_ENV !== 'production') {
    console.info('[analytics]', payload);
  }
}
