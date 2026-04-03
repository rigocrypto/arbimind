import express, { Request, Response, Router } from 'express';

const router: Router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    network: process.env['NETWORK'] || 'mainnet',
    evmChain: process.env['EVM_CHAIN'] || 'arbitrum',
  });
});

export default router;

