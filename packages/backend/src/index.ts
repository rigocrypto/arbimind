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
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/engine', engineRoutes);
app.use('/api/referral', referralRoutes);

const PORT = parseInt(process.env.PORT || '8000', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 ArbiMind Backend @ http://${HOST}:${PORT}`);
  console.log(`   /api/health  - Health check`);
  console.log(`   /api/engine   - Start/stop strategies`);
  console.log(`   /api/referral - Earnings + claim`);
});
