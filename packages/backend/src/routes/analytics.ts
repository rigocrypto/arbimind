import express from 'express';
import { Request, Response } from 'express';
import { validateRequest } from '../middleware/validation';
import { funnelEventSchema } from '../schemas/analyticsSchemas';
import { getCtaAbReport, insertFunnelEvent, isDbAvailable, listFunnelEvents, type CtaWindow } from '../db/portfolioDb';

const router = express.Router();

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

  if (!isDbAvailable()) {
    return res.status(503).json({
      ok: false,
      error: 'DATABASE_URL not set – analytics persistence unavailable',
    });
  }

  const id = await insertFunnelEvent({
    eventName: name,
    eventTs: ts ? new Date(ts) : new Date(),
    path,
    sessionId,
    userAddress,
    ctaVariant,
    properties,
    source,
  });

  if (!id) {
    return res.status(500).json({ ok: false, error: 'Failed to store event' });
  }

  return res.status(202).json({ ok: true, id });
});

router.get('/events', async (req: Request, res: Response) => {
  if (!isDbAvailable()) {
    return res.status(503).json({
      ok: false,
      error: 'DATABASE_URL not set – analytics persistence unavailable',
    });
  }

  const limitRaw = String(req.query.limit ?? '100');
  const limit = Number.parseInt(limitRaw, 10);
  const events = await listFunnelEvents(Number.isFinite(limit) ? limit : 100);

  return res.json({ ok: true, count: events.length, events });
});

router.get('/ab-cta', async (req: Request, res: Response) => {
  if (!isDbAvailable()) {
    return res.status(503).json({
      ok: false,
      error: 'DATABASE_URL not set – analytics persistence unavailable',
    });
  }

  const windowRaw = String(req.query.window ?? '7d').trim().toLowerCase();
  const window: CtaWindow =
    windowRaw === '24h' || windowRaw === '7d' || windowRaw === '30d'
      ? windowRaw
      : '7d';

  const bounceGuardrailRaw = Number.parseFloat(String(req.query.bounceGuardrailPct ?? '80'));
  const bounceGuardrailPct = Number.isFinite(bounceGuardrailRaw)
    ? Math.min(Math.max(bounceGuardrailRaw, 0), 100)
    : 80;

  const report = await getCtaAbReport(window);
  if (!report) {
    return res.status(500).json({ ok: false, error: 'Failed to build CTA A/B report' });
  }

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
