import { Request, Response, Router } from 'express';
import { randomBytes } from 'crypto';
import { getActivationByWallet, upsertActivation } from '../store/activationStore';

type PlanName = 'Auto Trader' | 'Passive Income' | 'Elite';
type RiskName = 'Conservative' | 'Balanced' | 'Aggressive';
type SpeedName = 'Standard' | 'Priority' | 'Ultra';

interface ActivationBody {
  wallet: string;
  selectedPlan: PlanName;
  capital: number;
  risk: RiskName;
  speed: SpeedName;
}

const router: Router = Router();

const PLAN_SET = new Set<PlanName>(['Auto Trader', 'Passive Income', 'Elite']);
const RISK_SET = new Set<RiskName>(['Conservative', 'Balanced', 'Aggressive']);
const SPEED_SET = new Set<SpeedName>(['Standard', 'Priority', 'Ultra']);
const PLAN_PRICE_USDC: Record<PlanName, number> = {
  'Auto Trader': 19,
  'Passive Income': 49,
  Elite: 99,
};

const isEvmAddress = (value: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(value);
const isSolanaAddress = (value: string): boolean => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);

router.post('/activate-bot', async (req: Request, res: Response) => {
  const body = (req.body || {}) as Partial<ActivationBody>;

  const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
  const selectedPlan = body.selectedPlan as PlanName;
  const capital = Number(body.capital);
  const risk = body.risk as RiskName;
  const speed = body.speed as SpeedName;

  if (!wallet || (!isEvmAddress(wallet) && !isSolanaAddress(wallet))) {
    return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
  }

  if (!PLAN_SET.has(selectedPlan)) {
    return res.status(400).json({ ok: false, error: 'Invalid selectedPlan' });
  }

  if (!Number.isFinite(capital) || capital < 100 || capital > 10_000_000) {
    return res.status(400).json({ ok: false, error: 'Invalid capital' });
  }

  if (!RISK_SET.has(risk)) {
    return res.status(400).json({ ok: false, error: 'Invalid risk' });
  }

  if (!SPEED_SET.has(speed)) {
    return res.status(400).json({ ok: false, error: 'Invalid speed' });
  }

  const sessionToken = randomBytes(24).toString('hex');

  const saved = await upsertActivation({
    wallet: wallet.toLowerCase(),
    plan: selectedPlan,
    capital: Math.floor(capital),
    risk,
    speed,
    sessionToken,
  });

  if (!saved) {
    return res.status(500).json({ ok: false, error: 'Failed to persist activation session' });
  }

  const paymentAddress =
    process.env.USDC_PAYMENT_ADDRESS?.trim() ||
    process.env.TREASURY_ADDRESS?.trim() ||
    null;

  const paymentRequired = saved.paymentStatus !== 'paid';

  return res.json({
    ok: true,
    sessionToken: saved.sessionToken,
    user: {
      wallet: saved.wallet,
      selectedPlan: saved.plan,
      botActive: saved.botActive,
      paymentStatus: saved.paymentStatus,
      updatedAt: saved.updatedAt,
    },
    payment: {
      paymentRequired,
      amount: PLAN_PRICE_USDC[selectedPlan],
      currency: 'USDC',
      address: paymentAddress,
      provider: 'manual_usdc',
    },
    warmup: {
      status: paymentRequired ? 'awaiting_payment' : 'warming_up',
      etaMinutesMin: 2,
      etaMinutesMax: 5,
    },
  });
});

router.get('/activate-bot/:wallet', async (req: Request, res: Response) => {
  const wallet = String(req.params.wallet || '').trim().toLowerCase();
  const session = await getActivationByWallet(wallet);

  if (!session) {
    return res.status(404).json({ ok: false, error: 'Activation session not found' });
  }

  return res.json({
    ok: true,
    sessionToken: session.sessionToken,
    user: {
      wallet: session.wallet,
      selectedPlan: session.plan,
      botActive: session.botActive,
      paymentStatus: session.paymentStatus,
      updatedAt: session.updatedAt,
    },
  });
});

export default router;
