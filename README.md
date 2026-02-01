# 🧠 ArbiMind

> **The brain of on-chain arbitrage**

A professional MEV/searcher system for detecting and executing arbitrage opportunities across multiple DEXes with intelligent risk management and profit optimization.

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
