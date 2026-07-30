import express, { Request, Response, Router } from 'express';
import { validateRequest } from '../middleware/validation';
import { funnelEventSchema } from '../schemas/analyticsSchemas';
import {
  getCtaAbReportResult,
  insertFunnelEventResult,
  listFunnelEventsResult,
  type CtaWindow,
} from '../db/portfolioDb';
import { sendDbFailure } from '../utils/dbResponse';

const router: Router = express.Router();

router.post('/events', validateRequest(funnelEventSchema), async (req: Request, res: Response) => {
  const {
    name,
    properties,
    ts,
    path,
    sessionId,
    userAddress,
    ctaVariant,
    source,
  } = req.body;

  const inserted = await insertFunnelEventResult({
    eventName: name,
    eventTs: ts ? new Date(ts) : new Date(),
    path,
    sessionId,
    userAddress,
    ctaVariant,
    properties,
    source,
  });

  if (!inserted.ok) {
    return sendDbFailure(res, inserted, 'analytics persistence');
  }

  if (!inserted.value) {
    return res.status(500).json({ ok: false, error: 'Failed to store event' });
  }

  return res.status(202).json({ ok: true, id: inserted.value });
});

router.get('/events', async (req: Request, res: Response) => {
  const limitRaw = String(req.query.limit ?? '100');
  const limit = Number.parseInt(limitRaw, 10);
  const result = await listFunnelEventsResult(Number.isFinite(limit) ? limit : 100);

  if (!result.ok) {
    return sendDbFailure(res, result, 'analytics persistence');
  }

  return res.json({ ok: true, count: result.value.length, events: result.value });
});

router.get('/ab-cta', async (req: Request, res: Response) => {
  const windowRaw = String(req.query.window ?? '7d').trim().toLowerCase();
  const window: CtaWindow =
    windowRaw === '24h' || windowRaw === '7d' || windowRaw === '30d'
      ? windowRaw
      : '7d';

  const bounceGuardrailRaw = Number.parseFloat(String(req.query.bounceGuardrailPct ?? '80'));
  const bounceGuardrailPct = Number.isFinite(bounceGuardrailRaw)
    ? Math.min(Math.max(bounceGuardrailRaw, 0), 100)
    : 80;

  const reportResult = await getCtaAbReportResult(window);
  if (!reportResult.ok) {
    return sendDbFailure(res, reportResult, 'CTA A/B report');
  }
  const report = reportResult.value;

  return res.json({
    ok: true,
    ...report,
    bounceGuardrailPct,
    variants: report.variants.map((variant) => ({
      ...variant,
      bounceGuardrailBreached: variant.bounceRatePct > bounceGuardrailPct,
    })),
  });
});

export default router;
