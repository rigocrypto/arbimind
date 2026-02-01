import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import healthRoutes from './routes/health';
import engineRoutes from './routes/engine';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/engine', engineRoutes);

const PORT = parseInt(process.env.PORT || '8000', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 ArbiMind Backend @ http://${HOST}:${PORT}`);
  console.log(`   /api/health  - Health check`);
  console.log(`   /api/engine  - Start/stop strategies`);
});
