import { Request, Response, NextFunction } from 'express';
import { adminStore } from '../store/adminStore';

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';
const SERVICE_KEY = process.env.AI_SERVICE_KEY || '';

function getClientIp(req: Request): string {
  const ff = req.headers['x-forwarded-for'];
  if (typeof ff === 'string') return ff.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const path = req.path || req.url || '/';

  if (!ADMIN_KEY) {
    adminStore.addAuditEvent({ type: 'admin_auth', ip, path, success: false, meta: { reason: 'config_missing' } });
    res.status(503).json({
      ok: false,
      error: 'Admin API not configured (ADMIN_API_KEY missing)',
      version: '1.0',
    });
    return;
  }
  const key = req.headers['x-admin-key'] as string;
  const serviceKey = req.headers['x-service-key'] as string;

  const serviceKeyAllowed =
    SERVICE_KEY &&
    serviceKey === SERVICE_KEY &&
    path.startsWith('/ai-dashboard/predictions');

  if (serviceKeyAllowed) {
    return next();
  }

  if (!key || key !== ADMIN_KEY) {
    adminStore.addAuditEvent({ type: 'admin_auth', ip, path, success: false, meta: { reason: key ? 'invalid_key' : 'missing_key' } });
    res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      version: '1.0',
    });
    return;
  }
  next();
}
