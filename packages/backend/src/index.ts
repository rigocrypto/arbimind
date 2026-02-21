import './env'; // Must be first – loads dotenv before any module reads process.env

import express from 'express';

import healthRoutes from './routes/health';
import engineRoutes from './routes/engine';
import referralRoutes from './routes/referral';
import adminRoutes from './routes/admin';
import opportunitiesRoutes from './routes/opportunities';
import executeRoutes from './routes/execute';
import solanaRoutes from './routes/solana';
import portfolioRoutes from './routes/portfolio';
import snapshotsRoutes from './routes/snapshots';
import rpcRoutes from './routes/rpc';
import analyticsRoutes from './routes/analytics';
import aiRoutes, { setAIService } from './routes/ai';
import { AIService } from './services/AIService';
import { resolveRpcUrl } from './utils/rpc';
import { captureSentryException, initializeSentry } from './utils/sentry';

if (!process.env.ADMIN_KEY?.trim() && !process.env.ADMIN_API_KEY?.trim()) {
  console.warn('⚠️  ADMIN_KEY not set – /api/admin/* will return 503. Add it to .env or Railway vars.');
}

if (resolveRpcUrl('worldchain_sepolia')) {
  console.log('🌐 World Chain Sepolia RPC loaded');
} else {
  console.warn('⚠️  World Chain Sepolia RPC not configured');
}

const app = express();
// Trust Railway/edge proxy so rate-limit uses X-Forwarded-For safely.
app.set('trust proxy', 1);

initializeSentry();

const aiService = new AIService();
setAIService(aiService);
aiService.initialize().catch((error) => {
  console.warn('⚠️  AI service failed to initialize. /api/ai/* will use fallback heuristics.', error);
});

// CORS headers FIRST – set before any other middleware so they're on all responses including errors
app.use((req, res, next) => {
  const origin = String(req.headers.origin || '').trim();
  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);

  const isAllowedOrigin = (candidate: string): boolean => {
    if (!candidate) return false;
    if (configuredOrigins.includes(candidate)) return true;
    if (/^https?:\/\/localhost(?::\d+)?$/i.test(candidate)) return true;
    if (/^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(candidate)) return true;
    if (/^https:\/\/arbimind\.app$/i.test(candidate)) return true;
    return false;
  };

  const allow = isAllowedOrigin(origin);
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ADMIN-KEY, X-SERVICE-KEY');
  }
  if (req.method === 'OPTIONS') {
    if (!allow && origin) {
      return res.status(403).json({ error: `CORS blocked for origin: ${origin}` });
    }
    return res.status(204).end();
  }
  return next();
});

app.use(express.json());

// Minimal test route – verify deploy is using latest code
app.get('/api/test', (_req, res) => res.json({ ok: true, v: 'ace7bce' }));

// Version/deploy verification – shows commit SHA from Railway
app.get('/api/version', (_req, res) =>
  res.json({
    ok: true,
    sha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    node: process.version,
    startedAt: new Date().toISOString(),
  })
);

if (process.env.NODE_ENV !== 'production') {
  app.get('/api/dev/sentry-test', (_req, res) => {
    const error = new Error('Sentry test error from /api/dev/sentry-test');
    captureSentryException(error);

    return res.status(500).json({
      ok: false,
      sentryTest: true,
      message: 'Sentry test error captured (non-production only).',
    });
  });
}

// Explicit referral route first (in case router mount has issues)
app.get('/api/referral/earnings', (req, res) => {
  const address = req.query.address as string;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.json({ earnings: 0 });
  }
  return res.json({ earnings: 0 });
});

app.use('/api/health', healthRoutes);
app.use('/api/engine', engineRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/solana', solanaRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/snapshots', snapshotsRoutes);
app.use('/api/rpc', rpcRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);

const PORT = parseInt(process.env.PORT || '8000', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 ArbiMind Backend @ http://${HOST}:${PORT}`);
  console.log(`   /api/health      - Health check`);
  console.log(`   /api/version     - Deploy verification`);
  console.log(`   /api/engine      - Start/stop strategies`);
  console.log(`   /api/referral    - Earnings + claim`);
  console.log(`   /api/admin       - Admin dashboard (X-ADMIN-KEY)`);
  console.log(`   /api/opportunities - Live opportunities`);
  console.log(`   /api/execute     - Execute opportunity`);
  console.log(`   /api/solana      - tx/transfer + jupiter/swap-tx`);
  console.log(`   /api/portfolio   - evm + solana arb portfolio`);
  console.log(`   /api/rpc         - RPC health checks`);
  console.log(`   /api/analytics   - Funnel analytics ingest`);
  console.log(`   /api/ai          - AI predictions + models`);
});
