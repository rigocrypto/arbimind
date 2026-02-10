import express, { Request, Response } from 'express';
import solanaTxRouter from './solanaTx';
import solanaJupiterRouter from './solanaJupiter';

const router = express.Router();
router.use('/tx', solanaTxRouter);
router.use('/jupiter', solanaJupiterRouter);

const LAMPORTS_PER_SOL = 1e9;
const FEE_RATE = 0.005; // 0.5%

/**
 * POST /api/solana/:action
 * Stub for buy | sell | transfer. Simulates fee calculation.
 */
router.post('/:action', (req: Request, res: Response) => {
  try {
    const { action } = req.params as { action: 'buy' | 'sell' | 'transfer' };
    const { amount = 1, arbAccount } = req.body || {};

    const validActions = ['buy', 'sell', 'transfer'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, error: `Invalid action: ${action}` });
    }

    const amountNum = typeof amount === 'number' ? amount : parseFloat(amount) || 1;
    const feeSol = amountNum * FEE_RATE;
    const feeLamports = feeSol * LAMPORTS_PER_SOL;

    // Mock tx sig
    const mockSig = `FakeTx${Date.now().toString(36)}...`;

    return res.json({
      success: true,
      sig: mockSig,
      feeCharged: feeSol,
      feeLamports: Math.round(feeLamports),
      message: `Solana ${action}: ${amountNum} SOL → Arb: ${arbAccount || 'default'} (Fee: ${feeSol.toFixed(4)} SOL)`,
    });
  } catch (error) {
    console.error('Solana route error:', error);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
