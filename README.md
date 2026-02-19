# 🧠 ArbiMind

![Post-Deploy Smoke](https://github.com/rigocrypto/arbimind/actions/workflows/post-deploy-smoke.yml/badge.svg)
![Nightly Smoke](https://github.com/rigocrypto/arbimind/actions/workflows/nightly-smoke.yml/badge.svg)
![Deploy UI to Vercel](https://github.com/rigocrypto/arbimind/actions/workflows/deploy-ui.yml/badge.svg)
![Bot Canary Sanity](https://github.com/rigocrypto/arbimind/actions/workflows/bot-canary-sanity.yml/badge.svg)
![Bot Typecheck / Build](https://github.com/rigocrypto/arbimind/actions/workflows/bot-build-check.yml/badge.svg)

_Workflow roles: **PR gating** → Bot Typecheck / Build. **Release/Ops gating** → Post-Deploy Smoke, Nightly Smoke, Bot Canary Sanity._

> **The brain of on-chain arbitrage**

A professional MEV/searcher system for detecting and executing arbitrage opportunities across multiple DEXes with intelligent risk management and profit optimization.

Ops: [Ops Snapshot](OPS_SNAPSHOT.md)

## 🔄 Nightly Smoke (Auto-Alerts)

Badge: [![Nightly Smoke](https://github.com/rigocrypto/arbimind/actions/workflows/nightly-smoke.yml/badge.svg)](https://github.com/rigocrypto/arbimind/actions/workflows/nightly-smoke.yml)

**Secrets** (Repo Settings → Actions → New repository secret):

| Secret | Value | Required |
| --- | --- | --- |
| BACKEND_BASE | https://backend-production-0932.up.railway.app | Yes |
| UI_BASE | https://arbimind.vercel.app | Yes |
| ADMIN_API_KEY | your-admin-key | No |
| ALERT_WEBHOOK_URL | https://hooks.slack.com/... | No (@ops issue always opens) |

Runs `smoke:all` daily at 3:00 AM UTC → opens issue + webhook on failure → posts ✅ on success.

Manual run: Actions → Nightly Smoke → Run workflow.

Growth Experiments: [CTA A/B Template](CTA_AB_DECISION_TEMPLATE.md)

## ⚡ Features

- **Multi-DEX Support**: Uniswap V2/V3, SushiSwap, Balancer, Curve
- **AI-Powered Intelligence**: Neural network models for opportunity prediction and risk assessment
- **Real-time Opportunity Detection**: Continuous monitoring of price deltas across exchanges
- **Intelligent Execution**: Atomic transactions with flash loans or working capital
- **AI Risk Management**: Dynamic risk scoring, anomaly detection, and adaptive parameters
- **Market Sentiment Analysis**: Multi-source sentiment analysis from social media and news
- **Professional UI**: Real-time dashboard with AI insights and predictions
- **Private Relays**: MEV-protected execution via private mempools

## 🏗️ Architecture

```
ArbiMind/
├── packages/
│   ├── ui/          # Next.js Web Dashboard
│   ├── backend/     # Express API (engine, health, strategies)
│   ├── bot/         # TypeScript Arbitrage Bot
│   └── contracts/   # Solidity Smart Contracts
```

### Core Components

1. **UI (Web dApp)**: Choose token pairs, set risk parameters, monitor performance
2. **Backend API**: Engine control, strategy start/stop, health checks
3. **Off-chain Bot**: Scans pools, simulates trades, computes profitability
4. **On-chain Executor**: Atomic arbitrage execution with safety checks

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Foundry (for smart contract development)
- Ethereum RPC endpoint
- Private key for execution wallet

### Installation

```bash
# Clone the repository
git clone https://github.com/rigocrypto/ArbiMind.git
cd ArbiMind

# Install dependencies (pnpm)
pnpm install

# Setup environment
cp env.example .env
# Edit .env with your configuration

# Build all packages
pnpm run build

# Start development (UI on :3000, or bot)
pnpm run dev:ui
pnpm run dev:bot
```

### Environment Configuration

Create a `.env` file with the following variables:

```env
# Ethereum Configuration
ETHEREUM_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY
PRIVATE_KEY=your_execution_wallet_private_key
TREASURY_ADDRESS=your_treasury_wallet_address

# Backend (for CORS when UI is separate)
FRONTEND_URL=http://localhost:3000

# Admin & Service Auth
ADMIN_API_KEY=your_admin_dashboard_key
AI_SERVICE_KEY=your_service_to_service_key

# Bot Configuration
MIN_PROFIT_ETH=0.01
MAX_GAS_GWEI=50
MIN_PROFIT_THRESHOLD=0.005

# DEX Configuration
UNISWAP_V2_ROUTER=0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
UNISWAP_V3_ROUTER=0xE592427A0AEce92De3Edee1F18E0157C05861564
SUSHISWAP_ROUTER=0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F

# Private Relay (Optional)
PRIVATE_RELAY_URL=your_private_relay_url
```

## 🤖 AI Features

ArbiMind includes advanced AI capabilities that transform it into a superintelligent arbitrage system:

### **AI-Powered Opportunity Detection**
- Neural network models using TensorFlow.js
- 8-feature analysis including price deltas, liquidity, volatility, and sentiment
- Confidence scoring and recommendation engine
- Real-time prediction updates

### **Intelligent Risk Management**
- Dynamic risk assessment based on market conditions
- Anomaly detection for unusual market patterns
- Adaptive slippage and gas price optimization
- Real-time volatility scoring

### **Market Sentiment Analysis**
- Multi-source sentiment from Twitter, Reddit, news, and Telegram
- Market mood classification (bullish/bearish/neutral)
- Sentiment-weighted decision making
- Cached sentiment data with 5-minute refresh intervals

### **Execution Optimization**
- AI-recommended optimal execution routes
- Intelligent flash loan vs. working capital decisions
- Priority scoring for execution timing
- Dynamic gas limit recommendations

## 🔐 Admin vs Service Authentication

- **ADMIN key** (`ADMIN_API_KEY`): human login for the UI at `/admin` and admin-only routes.
- **Service key** (`AI_SERVICE_KEY`): service-to-service auth for AI prediction logging/evaluation.

**Routes**
- Admin-only: most `/api/admin/*` routes and dashboard viewing.
- Service key allowed: `/api/admin/ai-dashboard/predictions*` (create/list/accuracy/evaluate).

**Rotation & storage**
- Treat both as secrets; rotate if leaked.
- Store in `.env` locally and in deployment secrets/variables in production.

For detailed AI setup and configuration, see [AI_SETUP.md](./AI_SETUP.md).

## 📊 Usage

### 1. Deploy Smart Contracts

```bash
cd packages/contracts
forge build
forge deploy --rpc-url $ETHEREUM_RPC_URL --private-key $PRIVATE_KEY
```

### 2. Start the Backend (local)

```bash
cd packages/backend
pnpm run dev
```

API: `http://localhost:8080` — `/api/health`, `/api/engine`

### RPC Health Endpoint

Use the backend RPC health endpoint to verify configured chain RPC connectivity at runtime.

```bash
# Default check (evm, solana, worldchain_sepolia)
curl http://localhost:8080/api/rpc/health

# World Chain Sepolia only
curl "http://localhost:8080/api/rpc/health?chain=worldchain_sepolia"

# Multi-chain check
curl "http://localhost:8080/api/rpc/health?chain=evm,worldchain_sepolia,solana"
```

Expected response shape:

```json
{
  "ok": true,
  "health": {
    "evm": "healthy",
    "worldchain_sepolia": "healthy",
    "solana": "healthy"
  },
  "details": {
    "evm": { "status": "healthy", "rpcUrl": "https://..." },
    "worldchain_sepolia": { "status": "healthy", "rpcUrl": "https://..." },
    "solana": { "status": "healthy", "rpcUrl": "https://..." }
  }
}
```

### 3. Start the Bot

```bash
pnpm run dev:bot
```

### 4. Access the Dashboard

Open [http://localhost:3000](http://localhost:3000) to access the ArbiMind dashboard.

---

## 🚢 Production Deployment

| Service  | Platform | URL |
|----------|----------|-----|
| **Backend** | [Railway](https://railway.app) | `https://arbimind-production.up.railway.app` |
| **UI**     | [Vercel](https://vercel.com)   | Your Vercel project URL |

### Backend (Railway)

- Set `RAILWAY_DOCKERFILE_PATH=Dockerfile.backend` in Railway
- Variables: `NODE_ENV=production`, `FRONTEND_URL=https://<your-ui-domain>`
- Test: `curl https://arbimind-production.up.railway.app/api/health`

### UI (Vercel)

- Set `NEXT_PUBLIC_API_URL=https://arbimind-production.up.railway.app/api`
- Must end with `/api`

See [DEPLOY.md](./DEPLOY.md) for full deployment details.

Day-1 operations checklist: [OPS_DAY1_RUNBOOK.md](./OPS_DAY1_RUNBOOK.md)

## 🚨 Post-Deploy Smoke Tests

ArbiMind runs automated post-deploy smoke checks using the workflow at [View Workflow](.github/workflows/post-deploy-smoke.yml).

### What it does

- Automatically runs after [Deploy UI to Vercel](.github/workflows/deploy-ui.yml) completes successfully.
- Runs the production smoke script [scripts/smoke-post-deploy.ps1](scripts/smoke-post-deploy.ps1) against backend + UI.
- Validates health, RPC connectivity, analytics ingest/query persistence, snapshots, UI CSP, and optional admin/portfolio checks.
- Sends a webhook alert on failure when `ALERT_WEBHOOK_URL` is configured.

### Manual trigger (`workflow_dispatch`)

1. Open **Actions** → **Post-Deploy Smoke** in GitHub.
2. Click **Run workflow**.
3. Optionally override:

  `backend_base` (default: `https://backend-production-0932.up.railway.app`),
  `ui_base` (default: `https://arbimind.vercel.app`),
  `analytics_only` (`true|false`, default: `false`) for quick analytics-only retries.

### Required secrets / variables

| Name | Purpose | Required? |
| --- | --- | --- |
| `ADMIN_API_KEY` | Enables `/api/admin/*` smoke checks | Optional |
| `EVM_ARB_ACCOUNT` | Enables EVM portfolio summary/timeseries checks | Optional |
| `SOLANA_ARB_ACCOUNT` | Enables Solana portfolio summary/timeseries checks | Optional |
| `ALERT_WEBHOOK_URL` | Sends failure notifications to Slack/Discord-compatible webhook | Optional |

### Outputs and integrations

- **Workflow logs**: pass/fail summary for every smoke check.
- **Failure notification**: webhook message includes branch/ref, backend URL, UI URL, and run link.

### Quick local analytics-only smoke

```bash
npm run smoke:analytics -- -BackendBase "https://backend-production-0932.up.railway.app"
```

- **Railway/Vercel tie-in**:
  - UI deploy trigger comes from [Deploy UI to Vercel](.github/workflows/deploy-ui.yml).
  - Backend/UI runtime configuration guidance is in [DEPLOY.md](DEPLOY.md).
  - Uptime monitor setup and escalation policy are in [ALERTING_CONFIGURATION.md](ALERTING_CONFIGURATION.md).

## 🔧 Configuration

### Token Allowlist

Configure which tokens to monitor in `packages/bot/src/config/tokens.ts`:

```typescript
export const ALLOWLISTED_TOKENS = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8",
  // Add more tokens...
};
```

### DEX Configuration

Configure DEXes and their parameters in `packages/bot/src/config/dexes.ts`:

```typescript
export const DEX_CONFIG = {
  UNISWAP_V2: {
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    fee: 0.003,
  },
  // Add more DEXes...
};
```

## 🛡️ Security Features

- **Reentrancy Protection**: All external calls are protected
- **Slippage Control**: Configurable minimum output amounts
- **Gas Optimization**: Efficient transaction batching
- **Private Execution**: MEV protection via private relays
- **Audit-Ready**: Clean, well-documented smart contracts

## 📈 Performance Monitoring

The dashboard provides real-time insights into:

- **P&L Tracking**: Cumulative profit/loss over time
- **Gas Analytics**: Gas costs and optimization opportunities
- **Route Performance**: Success rates by arbitrage path
- **Transaction Logs**: Detailed execution history
- **Risk Metrics**: Slippage and failed transaction analysis

## 📝 Development Notes

### Lighthouse

- **Known warning (ignorable)**: The Solana wallet adapter modal inputs (Phantom, Solflare, etc.) are third-party and may trigger "form field should have id or name" / "no label associated" in Lighthouse. These cannot be fixed in our codebase. Our own forms use proper `id`, `name`, and `label htmlFor`.

### Production CSP

- CSP is **skipped in development** (`NODE_ENV !== 'production'`) so dev tooling and wallet adapters work without eval blocking.
- In production, CSP includes `connect-src https: wss:` (covers Solana RPC, EVM RPCs), `img-src data:` (wallet icons), `style-src 'unsafe-inline'`, and `frame-src` for WalletConnect. Verify `/solana-wallet` connect works after `pnpm build && pnpm start`.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Risk Disclosure

**Trading cryptocurrencies involves substantial risk of loss and is not suitable for all investors. The value of cryptocurrencies can go down as well as up, and you may lose some or all of your investment.**

- Past performance does not guarantee future results
- Arbitrage opportunities are highly competitive and may disappear quickly
- Gas fees and MEV costs can significantly impact profitability
- Smart contract risks exist despite security measures

## 🆘 Support

- **Documentation**: [docs.arbimind.xyz](https://docs.arbimind.xyz)
- **Discord**: [discord.gg/arbimind](https://discord.gg/arbimind)
- **Twitter**: [@ArbiMind](https://twitter.com/ArbiMind)

---

**Built with ❤️ by the ArbiMind Team**
