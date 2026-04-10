import { Request, Response, Router } from 'express';
import { randomBytes } from 'crypto';

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

interface ActivationSession {
  wallet: string;
  selectedPlan: PlanName;
  capital: number;
  risk: RiskName;
  speed: SpeedName;
  botActive: boolean;
  sessionToken: string;
  createdAt: number;
  updatedAt: number;
}

const router: Router = Router();

const PLAN_SET = new Set<PlanName>(['Auto Trader', 'Passive Income', 'Elite']);
const RISK_SET = new Set<RiskName>(['Conservative', 'Balanced', 'Aggressive']);
const SPEED_SET = new Set<SpeedName>(['Standard', 'Priority', 'Ultra']);

const activationSessions = new Map<string, ActivationSession>();

const isEvmAddress = (value: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(value);
const isSolanaAddress = (value: string): boolean => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);

router.post('/activate-bot', (req: Request, res: Response) => {
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

  const normalizedWallet = wallet.toLowerCase();
  const previous = activationSessions.get(normalizedWallet);
  const now = Date.now();
  const sessionToken = randomBytes(24).toString('hex');

  const session: ActivationSession = {
    wallet,
    selectedPlan,
    capital,
    risk,
    speed,
    botActive: true,
    sessionToken,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };

  activationSessions.set(normalizedWallet, session);

  return res.json({
    ok: true,
    sessionToken,
    user: {
      wallet: session.wallet,
      selectedPlan: session.selectedPlan,
      botActive: session.botActive,
      updatedAt: session.updatedAt,
    },
    warmup: {
      status: 'warming_up',
      etaMinutesMin: 2,
      etaMinutesMax: 5,
    },
  });
});

router.get('/activate-bot/:wallet', (req: Request, res: Response) => {
  const wallet = String(req.params.wallet || '').trim().toLowerCase();
  const session = activationSessions.get(wallet);

  if (!session) {
    return res.status(404).json({ ok: false, error: 'Activation session not found' });
  }

  return res.json({
    ok: true,
    user: {
      wallet: session.wallet,
      selectedPlan: session.selectedPlan,
      botActive: session.botActive,
      updatedAt: session.updatedAt,
    },
  });
});

export default router;
