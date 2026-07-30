/**
 * Maps a structured database failure onto an HTTP response.
 *
 * The distinction matters operationally:
 *   - `unconfigured` / `unreachable` -> 503, the service cannot serve this route
 *   - `query_failed`                 -> 500, the server reached the database and broke
 *
 * The underlying error message is deliberately NOT returned to the client.
 * Connection errors embed internal hostnames (e.g. `postgres.railway.internal`)
 * and these routes are unauthenticated. The full message is logged server-side
 * by `runDbOperation`; the client gets the failure kind and SQLSTATE/errno,
 * which is enough to triage without leaking topology.
 */

import type { Response } from 'express';
import type { DbFailure } from '../db/portfolioDb';

export function sendDbFailure(res: Response, failure: DbFailure, context: string): Response {
  const code = failure.code ? { code: failure.code } : {};

  switch (failure.kind) {
    case 'unconfigured':
      return res.status(503).json({
        ok: false,
        error: `DATABASE_URL not set – ${context} unavailable`,
        dbStatus: 'unconfigured',
      });

    case 'unreachable':
      return res.status(503).json({
        ok: false,
        error: `Database unreachable – ${context} unavailable`,
        dbStatus: 'unreachable',
        ...code,
      });

    case 'query_failed':
    default:
      return res.status(500).json({
        ok: false,
        error: `${context} failed`,
        dbStatus: 'query_failed',
        ...code,
      });
  }
}
