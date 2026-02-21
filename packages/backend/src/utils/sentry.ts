import * as Sentry from '@sentry/node';

let sentryEnabled = false;

export function initializeSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0'),
    sendDefaultPii: false,
  });

  sentryEnabled = true;
}

export function captureSentryException(error: unknown): void {
  if (!sentryEnabled) {
    return;
  }

  Sentry.captureException(error);
}
