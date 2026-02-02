import express, { Request, Response } from 'express';

const router = express.Router();

// In-memory mock for MVP – replace with Supabase/Postgres when ready
const earningsByAddress: Record<string, number> = {};

/**
 * GET /api/referral/earnings?address=0x...
 * Returns referral earnings for the given address (ETH).
 */
router.get('/earnings', (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.json({ earnings: 0 });
    }
    const normalized = address.toLowerCase();
    const earnings = earningsByAddress[normalized] ?? 0;
    res.json({ earnings });
  } catch (error) {
    console.error('Referral earnings error:', error);
    res.status(500).json({ earnings: 0 });
  }
});

/**
 * POST /api/referral/claim
 * Claims referral earnings to wallet.
 * Body: { address: string }
 */
router.post('/claim', (req: Request, res: Response) => {
  try {
    const { address } = req.body || {};
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ ok: false, error: 'Invalid address' });
    }
    const normalized = address.toLowerCase();
    const amount = earningsByAddress[normalized] ?? 0;
    if (amount <= 0) {
      return res.json({ ok: true, claimed: 0, txHash: null });
    }
    // TODO: Multi-sig treasury claim, emit tx
    earningsByAddress[normalized] = 0;
    console.log(`📤 [REFERRAL] Claimed ${amount} ETH for ${address}`);
    res.json({ ok: true, claimed: amount, txHash: null });
  } catch (error) {
    console.error('Referral claim error:', error);
    res.status(500).json({ ok: false, error: 'Claim failed' });
  }
});

export default router;
