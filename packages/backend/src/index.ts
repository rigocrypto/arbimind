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
import aiRoutes, { setAIService } from './routes/ai';
import { AIService } from './services/AIService';

if (!process.env.ADMIN_KEY?.trim() && !process.env.ADMIN_API_KEY?.trim()) {
  console.warn('⚠️  ADMIN_KEY not set – /api/admin/* will return 503. Add it to .env or Railway vars.');
}

const app = express();

const aiService = new AIService();
setAIService(aiService);
aiService.initialize().catch((error) => {
  console.warn('⚠️  AI service failed to initialize. /api/ai/* will use fallback heuristics.', error);
});

// CORS headers FIRST – set before any other middleware so they're on all responses including errors
app.use((req, res, next) => {
  const origin = req.headers.origin as string;
  const allow =
    origin &&
    (!!process.env.FRONTEND_URL?.split(/[\s,]+/).find((u) => u?.trim() === origin) ||
      (() => {
        try {
          const h = new URL(origin).hostname;
          return h === 'localhost' || h === 'arbimind.vercel.app' || h.endsWith('.vercel.app');
        } catch {
          return false;
        }
      })());
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-ADMIN-KEY, X-SERVICE-KEY');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
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
  console.log(`   /api/ai          - AI predictions + models`);
});
