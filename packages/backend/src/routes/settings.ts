import express, { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuth } from '../middleware/adminAuth';
import {
  getSettings,
  updateSettings,
  resetSettings,
} from '../store/settingsStore';
import { APPLIED_META, EngineSettings } from '../types/settings';

const router: Router = express.Router();

/* ---- Rate limiting: 30 writes/min, reads unlimited ---- */
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'rate_limited' },
});

/* ---- Helpers ---- */
function maskUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/***`;
  } catch {
    return '***';
  }
}

function maskSensitive(s: EngineSettings): EngineSettings {
  return {
    ...s,
    discordWebhookUrl: maskUrl(s.discordWebhookUrl),
  };
}

/* ---- GET /api/settings ---- */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    const engineMode: 'simulation' | 'live' | 'unknown' =
      process.env.SIMULATED_ENGINE_ENABLED === 'true'
        ? 'simulation'
        : process.env.ENGINE_MODE === 'live' || process.env.AUTO_TRADE === 'true'
          ? 'live'
          : 'unknown';
    return res.json({
      ok: true,
      settings: maskSensitive(settings),
      source: 'backend',
      applied: APPLIED_META,
      engineMode,
    });
  } catch (err) {
    console.error('[SETTINGS-ROUTE] GET error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to load settings' });
  }
});

/* ---- PUT /api/settings (admin-only) ---- */
router.put('/', writeLimiter, adminAuth, async (req: Request, res: Response) => {
  try {
    const result = await updateSettings(req.body);
    if (result.error) {
      return res.status(400).json({
        ok: false,
        error: result.error,
        issues: result.details || [],
      });
    }
    return res.json({
      ok: true,
      settings: maskSensitive(result.settings!),
      source: 'backend',
      applied: APPLIED_META,
    });
  } catch (err) {
    console.error('[SETTINGS-ROUTE] PUT error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to save settings' });
  }
});

/* ---- POST /api/settings/reset (admin-only) ---- */
router.post('/reset', writeLimiter, adminAuth, async (_req: Request, res: Response) => {
  try {
    const settings = await resetSettings();
    const engineMode: 'simulation' | 'live' | 'unknown' =
      process.env.SIMULATED_ENGINE_ENABLED === 'true'
        ? 'simulation'
        : process.env.ENGINE_MODE === 'live'
          ? 'live'
          : 'unknown';
    return res.json({
      ok: true,
      settings: maskSensitive(settings),
      source: 'backend',
      applied: APPLIED_META,
      engineMode,
    });
  } catch (err) {
    console.error('[SETTINGS-ROUTE] POST /reset error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to reset settings' });
  }
});

export default router;
