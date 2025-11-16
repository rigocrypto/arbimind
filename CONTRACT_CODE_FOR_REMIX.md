# 📋 Contract Code for Remix IDE Deployment

## 🎯 **Copy These Contracts to Remix IDE**

Copy each contract from your local files to Remix IDE for testnet deployment.

## 📁 **File 1: ArbiMindStrategyManager.sol**

Copy the entire content from: `packages/contracts/src/ArbiMindStrategyManager.sol`

## 📁 **File 2: ArbitrageAdapterV2V3.sol**

Copy the entire content from: `packages/contracts/src/adapters/ArbitrageAdapterV2V3.sol`

## 📁 **File 3: TrendAdapter.sol**

Copy the entire content from: `packages/contracts/src/adapters/TrendAdapter.sol`

## 📁 **File 4: MarketMakerAdapter.sol**

Copy the entire content from: `packages/contracts/src/adapters/MarketMakerAdapter.sol`

## 🔧 **Remix IDE Setup Steps**

### **Step 1: Open Remix IDE**
1. Go to: https://remix.ethereum.org/
2. Click "Create a new workspace"
3. Name it "ArbiMind-Testnet"

### **Step 2: Create Files**
1. Click "Create new file" for each contract
2. Name them exactly as shown above
3. Paste the contract code

### **Step 3: Compile**
1. Go to "Solidity Compiler" tab
2. Set compiler version to **0.8.20**
3. Click "Compile [ContractName].sol"
4. Check for any compilation errors

### **Step 4: Deploy**
1. Go to "Deploy & Run Transactions"
2. Connect MetaMask (switch to Goerli/Sepolia testnet)
3. Deploy contracts in this order:
   - Strategy Manager first
   - Then all adapters
   - Then configure strategies

## 📊 **Deployment Parameters**

### **Strategy Manager Constructor**
```
_executor: [Your wallet address]
_treasury: [Your wallet address]
_maxDailyLossWei: 1000000000000000000 (1 ETH)
```

### **Arbitrage Adapter Constructor**
```
_strategyManager: [Strategy Manager address]
_uniswapV2Router: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
_uniswapV3Router: 0xE592427A0AEce92De3Edee1F18E0157C05861564
```

### **Trend Adapter Constructor**
```
_oracle: [Your wallet address]
```

### **Market Maker Adapter Constructor**
```
_positionManager: 0xC36442b4a4522E871399CD717aBDD847Ab11FE88
_factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984
```

## 🎯 **Quick Deployment Checklist**

- [ ] All 4 contracts created in Remix
- [ ] All contracts compile without errors
- [ ] MetaMask connected to testnet
- [ ] Strategy Manager deployed
- [ ] All adapters deployed
- [ ] Strategies registered
- [ ] Allocations set (40/30/30)
- [ ] Basic functions tested (pause/unpause)

## 🚀 **Ready to Deploy!**

Once you've copied all contracts to Remix and compiled them successfully, you're ready to deploy to testnet!

Follow the detailed guide in `TESTNET_DEPLOYMENT_GUIDE.md` for the complete deployment process.
