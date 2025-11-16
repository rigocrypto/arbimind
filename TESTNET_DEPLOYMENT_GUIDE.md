# 🧪 ArbiMind Testnet Deployment & Testing Guide

## 🎯 **Test First, Deploy Later**

This guide will help you deploy your ArbiMind multi-strategy auto-trader to a testnet for comprehensive testing before mainnet deployment.

## 📋 **Step-by-Step Testnet Deployment**

### **Step 1: Prepare Your Environment**

#### **1.1 Get Testnet ETH**
- **Goerli Faucet**: https://goerlifaucet.com/
- **Sepolia Faucet**: https://sepoliafaucet.com/
- Request 0.1-0.5 testnet ETH for gas fees

#### **1.2 Configure MetaMask**
1. Open MetaMask
2. Add testnet network:
   - **Goerli**: Network ID 5
   - **Sepolia**: Network ID 11155111
3. Switch to your chosen testnet

### **Step 2: Deploy Contracts Using Remix IDE**

#### **2.1 Open Remix IDE**
1. Go to: https://remix.ethereum.org/
2. Create new workspace: "ArbiMind-Testnet"

#### **2.2 Create Contract Files**
Create these files in Remix:

1. **ArbiMindStrategyManager.sol**
2. **ArbitrageAdapterV2V3.sol**
3. **TrendAdapter.sol**
4. **MarketMakerAdapter.sol**

Copy the contract code from your local files.

#### **2.3 Compile Contracts**
1. Go to "Solidity Compiler" tab
2. Set compiler version to **0.8.20**
3. Compile each contract (check for errors)

#### **2.4 Deploy Strategy Manager**
1. Go to "Deploy & Run Transactions"
2. Connect MetaMask (ensure testnet is selected)
3. Select `ArbiMindStrategyManager`
4. Set constructor parameters:
   ```
   _executor: [Your wallet address]
   _treasury: [Your wallet address]
   _maxDailyLossWei: 1000000000000000000 (1 ETH)
   ```
5. Click "Deploy"
6. **Save the deployed address!**

#### **2.5 Deploy Adapters**

**ArbitrageAdapterV2V3:**
```
_strategyManager: [Strategy Manager address]
_uniswapV2Router: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
_uniswapV3Router: 0xE592427A0AEce92De3Edee1F18E0157C05861564
```

**TrendAdapter:**
```
_oracle: [Your wallet address]
```

**MarketMakerAdapter:**
```
_positionManager: 0xC36442b4a4522E871399CD717aBDD847Ab11FE88
_factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984
```

### **Step 3: Configure the System**

#### **3.1 Register Strategies**
Call `registerStrategy` on Strategy Manager for each adapter:

```solidity
// Arbitrage Strategy
registerStrategy(
    0x4152424954524147450000000000000000000000000000000000000000000000,
    [ArbitrageAdapter address]
)

// Trend Strategy
registerStrategy(
    0x5452454e44000000000000000000000000000000000000000000000000000000,
    [TrendAdapter address]
)

// Market Making Strategy
registerStrategy(
    0x4d41524b45545f4d414b494e4700000000000000000000000000000000000000,
    [MarketMakerAdapter address]
)
```

#### **3.2 Set Allocations**
Call `updateStrategy` for each:

```solidity
// Arbitrage: 40%
updateStrategy(
    0x4152424954524147450000000000000000000000000000000000000000000000,
    [ArbitrageAdapter address],
    true,  // enabled
    4000   // 40% allocation
)

// Trend: 30%
updateStrategy(
    0x5452454e44000000000000000000000000000000000000000000000000000000,
    [TrendAdapter address],
    true,  // enabled
    3000   // 30% allocation
)

// Market Making: 30%
updateStrategy(
    0x4d41524b45545f4d414b494e4700000000000000000000000000000000000000,
    [MarketMakerAdapter address],
    true,  // enabled
    3000   // 30% allocation
)
```

## 🧪 **Testing Procedures**

### **Test 1: Basic Functionality**

#### **1.1 Pause/Unpause System**
```solidity
// Pause the system
pause()

// Unpause the system
unpause()
```

#### **1.2 Check Strategy Status**
```solidity
// Get strategy info
getStrategy(0x4152424954524147450000000000000000000000000000000000000000000000)
```

#### **1.3 Test Emergency Functions**
```solidity
// Emergency withdraw ETH
emergencyWithdrawETH([recipient address], [amount])

// Emergency withdraw token
emergencyWithdrawToken([token address], [recipient], [amount])
```

### **Test 2: Strategy-Specific Testing**

#### **2.1 Arbitrage Adapter Test**
1. **Check flash loan functionality** (will revert on testnet due to no profitable opportunities)
2. **Verify profit thresholds**
3. **Test slippage protection**

#### **2.2 Trend Adapter Test**
1. **Create test signature** for AI prediction
2. **Test confidence thresholds**
3. **Verify oracle signature validation**

#### **2.3 Market Maker Adapter Test**
1. **Test position creation** (requires testnet tokens)
2. **Verify fee collection**
3. **Test position rebalancing**

### **Test 3: Integration Testing**

#### **3.1 Strategy Execution**
1. **Simulate strategy calls** (will revert on testnet due to no opportunities)
2. **Verify allocation enforcement**
3. **Test daily loss limits**

#### **3.2 Event Monitoring**
1. **Check for proper event emissions**
2. **Verify PnL tracking**
3. **Monitor strategy performance**

## 📊 **Testnet Addresses**

### **Goerli Testnet**
- **WETH**: `0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6`
- **USDC**: `0x07865c6E87B9F70255377e024ace6630C1Eaa37F`
- **Uniswap V2 Router**: `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`
- **Uniswap V3 Router**: `0xE592427A0AEce92De3Edee1F18E0157C05861564`
- **Uniswap V3 Position Manager**: `0xC36442b4a4522E871399CD717aBDD847Ab11FE88`

### **Sepolia Testnet**
- **WETH**: `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`
- **USDC**: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- **Uniswap V2 Router**: `0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008`
- **Uniswap V3 Router**: `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`
- **Uniswap V3 Position Manager**: `0x1238536071E1c677A632429e3655c799b22cDA52`

## ✅ **Testnet Validation Checklist**

### **Deployment Validation**
- [ ] All contracts deployed successfully
- [ ] No compilation errors
- [ ] Constructor parameters set correctly
- [ ] All strategies registered
- [ ] Allocations configured (40/30/30)

### **Functionality Testing**
- [ ] Pause/unpause working
- [ ] Emergency functions accessible
- [ ] Strategy registration successful
- [ ] Allocation enforcement working
- [ ] Daily loss limits configured

### **Security Testing**
- [ ] Access controls working (owner/executor)
- [ ] Reentrancy protection active
- [ ] Emergency pause functional
- [ ] Withdrawal functions secure

### **Integration Testing**
- [ ] Strategy manager can call adapters
- [ ] Events emitted correctly
- [ ] PnL tracking functional
- [ ] Risk management active

## 🚨 **Expected Testnet Behavior**

### **Normal Reverts (Expected)**
- **Arbitrage opportunities**: Will revert due to no profitable opportunities on testnet
- **Flash loans**: May fail due to testnet liquidity
- **Market making**: Limited by testnet token availability

### **Successful Operations**
- **Contract deployment**: Should succeed
- **Strategy registration**: Should succeed
- **Pause/unpause**: Should work
- **Emergency functions**: Should work
- **Access controls**: Should work

## 📞 **Next Steps After Testnet**

1. **Share deployed addresses** with me
2. **Run through test checklist**
3. **Verify all functionality**
4. **Plan mainnet deployment**
5. **Set up monitoring and alerts**

## 🎯 **Success Criteria**

Your testnet deployment is successful when:
- ✅ All contracts deploy without errors
- ✅ Basic functionality works (pause/unpause)
- ✅ Emergency functions are accessible
- ✅ Strategy registration succeeds
- ✅ Allocations are set correctly
- ✅ Access controls work properly

---

**Ready to test? Let's deploy to testnet and validate everything!** 🧪

Share your testnet addresses once deployed, and I'll help you run through the testing procedures.
