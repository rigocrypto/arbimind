# 🚀 ArbiMind Setup Guide

## Overview

ArbiMind is a professional MEV/searcher system for detecting and executing arbitrage opportunities across multiple DEXes. This guide will help you set up and run the complete system.

## 📁 Project Structure

```
ArbiMind/
├── packages/
│   ├── contracts/     # Smart contracts (Foundry)
│   ├── bot/          # TypeScript arbitrage bot
│   └── ui/           # Next.js dashboard
├── env.example       # Environment variables template
├── package.json      # Root workspace configuration
└── README.md         # Project documentation
```

## 🛠️ Prerequisites

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Foundry** - For smart contract development
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```
3. **Git** - For version control
4. **Ethereum RPC endpoint** - Alchemy, Infura, or your own node

## 🔧 Installation Steps

### 1. Environment Setup

Copy the environment template and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Ethereum Configuration
ETHEREUM_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY
PRIVATE_KEY=your_execution_wallet_private_key
TREASURY_ADDRESS=your_treasury_wallet_address

# Bot Configuration
MIN_PROFIT_ETH=0.01
MAX_GAS_GWEI=50
MIN_PROFIT_THRESHOLD=0.005
SCAN_INTERVAL_MS=200

# Contract Configuration
ARB_EXECUTOR_ADDRESS=deployed_contract_address

# Logging Configuration
LOG_LEVEL=info
```

### 2. Install Dependencies

Install dependencies for each package:

```bash
# Install bot dependencies
cd packages/bot
npm install

# Install UI dependencies
cd ../ui
npm install

# Install contract dependencies (if needed)
cd ../contracts
forge install
```

### 3. Deploy Smart Contracts

Deploy the arbitrage executor contract:

```bash
cd packages/contracts

# Build contracts
forge build

# Deploy to mainnet (update addresses in script/Deploy.s.sol first)
forge script Deploy --rpc-url $ETHEREUM_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify

# Or deploy to testnet for testing
forge script Deploy --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast
```

Update your `.env` file with the deployed contract address.

### 4. Configure Bot Settings

Edit `packages/bot/src/config/tokens.ts` to add/remove tokens:

```typescript
export const ALLOWLISTED_TOKENS = {
  WETH: {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18
  },
  // Add more tokens...
};
```

Edit `packages/bot/src/config/dexes.ts` to configure DEXes:

```typescript
export const DEX_CONFIG = {
  UNISWAP_V2: {
    name: "Uniswap V2",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    fee: 0.003,
    version: "v2",
    enabled: true
  },
  // Add more DEXes...
};
```

## 🚀 Running ArbiMind

### Start the Bot

```bash
cd packages/bot
npm run dev
```

The bot will:
- Scan for arbitrage opportunities across configured DEXes
- Execute profitable trades automatically
- Log all activities and performance metrics

### Start the Dashboard

```bash
cd packages/ui
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the ArbiMind dashboard.

## 📊 Dashboard Features

- **Real-time P&L tracking**
- **Bot status and controls**
- **Transaction history**
- **Performance metrics**
- **Gas cost analysis**
- **Risk management settings**

## 🔒 Security Considerations

1. **Private Keys**: Never commit private keys to version control
2. **RPC Limits**: Use dedicated RPC endpoints for production
3. **Gas Management**: Set appropriate gas limits and price caps
4. **Slippage Protection**: Configure maximum slippage tolerances
5. **MEV Protection**: Use private relays for execution

## 🧪 Testing

### Test on Sepolia

1. Get Sepolia ETH from a faucet
2. Deploy contracts to Sepolia testnet
3. Configure bot for testnet
4. Run with small amounts first

### Local Testing

```bash
# Start local Anvil instance
anvil

# Deploy to local network
forge script Deploy --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
```

## 📈 Performance Optimization

1. **RPC Optimization**: Use multiple RPC endpoints for redundancy
2. **Gas Optimization**: Monitor and adjust gas strategies
3. **Liquidity Analysis**: Focus on high-liquidity pairs
4. **Route Optimization**: Implement multi-hop arbitrage detection
5. **Risk Management**: Set appropriate profit thresholds

## 🐛 Troubleshooting

### Common Issues

1. **RPC Connection Errors**
   - Check your RPC URL and API key
   - Ensure you have sufficient rate limits

2. **Gas Estimation Failures**
   - Increase gas limit estimates
   - Check network congestion

3. **Contract Deployment Issues**
   - Verify Foundry installation
   - Check contract bytecode size limits

4. **Bot Not Finding Opportunities**
   - Verify token addresses
   - Check DEX router configurations
   - Adjust profit thresholds

### Logs and Debugging

The bot logs all activities to:
- Console output
- `logs/combined.log`
- `logs/error.log`

## 🔄 Updates and Maintenance

1. **Regular Updates**: Keep dependencies updated
2. **Gas Strategy**: Monitor and adjust gas strategies
3. **Token Lists**: Update allowlisted tokens as needed
4. **DEX Support**: Add new DEXes as they become available
5. **Security Audits**: Regular security reviews

## 📞 Support

- **Documentation**: Check the README.md for detailed information
- **Issues**: Report bugs and feature requests via GitHub
- **Community**: Join our Discord for discussions

## ⚠️ Risk Disclaimer

**Trading cryptocurrencies involves substantial risk of loss and is not suitable for all investors. The value of cryptocurrencies can go down as well as up, and you may lose some or all of your investment.**

- Past performance does not guarantee future results
- Arbitrage opportunities are highly competitive
- Gas fees and MEV costs can significantly impact profitability
- Smart contract risks exist despite security measures

---

**Built with ❤️ by the ArbiMind Team**
