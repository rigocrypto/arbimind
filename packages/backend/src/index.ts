import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import healthRoutes from './routes/health';
import engineRoutes from './routes/engine';
import referralRoutes from './routes/referral';

dotenv.config();

const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(/[\s,]+/).filter(Boolean)
  : ['http://localhost:3000'];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, origin);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
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

const PORT = parseInt(process.env.PORT || '8000', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 ArbiMind Backend @ http://${HOST}:${PORT}`);
  console.log(`   /api/health  - Health check`);
  console.log(`   /api/version - Deploy verification`);
  console.log(`   /api/engine  - Start/stop strategies`);
  console.log(`   /api/referral - Earnings + claim`);
});
