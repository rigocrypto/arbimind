"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionService = exports.ensureApproval = void 0;
const ethers_1 = require("ethers");
const Logger_1 = require("../utils/Logger");
const config_1 = require("../config");
const tokens_1 = require("../config/tokens");
const tokens_2 = require("../config/tokens");
const ERC20_ABI = [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
];
const MAINNET_V2_ROUTER = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
function normalizeAddress(value) {
    return (value || '').trim().toLowerCase();
}
function isEthereumSepoliaProfile() {
    const network = (process.env['NETWORK'] || '').trim().toLowerCase();
    const evmChain = (process.env['EVM_CHAIN'] || '').trim().toLowerCase();
    return network === 'testnet' && evmChain === 'ethereum';
}
function resolveAddress(primaryEnv, fallbackEnv, label) {
    const raw = (process.env[primaryEnv] || process.env[fallbackEnv] || '').trim();
    if (!raw)
        return '';
    try {
        return (0, ethers_1.getAddress)(raw.toLowerCase());
    }
    catch {
        throw new Error(`Invalid address for ${label}: ${raw}`);
    }
}
async function ensureApproval(tokenAddress, spender, amount, wallet) {
    const erc20 = new ethers_1.ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const allowance = await erc20.allowance(wallet.address, spender);
    if (allowance < amount) {
        const tx = await erc20.approve(spender, ethers_1.ethers.MaxUint256);
        await tx.wait();
        console.log('[APPROVED]', { token: tokenAddress, spender });
    }
}
exports.ensureApproval = ensureApproval;
class ExecutionService {
    wallet;
    executorAddress;
    logger;
    constructor(wallet, executorAddress) {
        this.wallet = wallet;
        this.executorAddress = executorAddress;
        this.logger = new Logger_1.Logger('ExecutionService');
    }
    getReceiptGasPrice(receipt) {
        if (!receipt)
            return '0';
        const withGas = receipt;
        return withGas.effectiveGasPrice?.toString() ?? withGas.gasPrice?.toString() ?? '0';
    }
    /**
     * One-time approval for Sepolia routers so swaps can spend ERC20s.
     * Call at startup before the scan loop.
     */
    async ensureSepoliaRouterApprovals() {
        const v2Router = resolveAddress('SEPOLIA_UNISWAP_V2_ROUTER', 'UNISWAP_V2_ROUTER', 'SEPOLIA_UNISWAP_V2_ROUTER');
        const v3Router = resolveAddress('SEPOLIA_UNISWAP_V3_ROUTER', 'UNISWAP_V3_ROUTER', 'SEPOLIA_UNISWAP_V3_ROUTER');
        if (isEthereumSepoliaProfile() && normalizeAddress(v2Router) === MAINNET_V2_ROUTER) {
            this.logger.warn('Skipping approvals: SEPOLIA_UNISWAP_V2_ROUTER is set to mainnet router 0x7a25...');
            return;
        }
        if (!v2Router && !v3Router)
            return;
        const symbols = Object.keys(tokens_2.ALLOWLISTED_TOKENS);
        const amount = ethers_1.ethers.MaxUint256;
        for (const symbol of symbols) {
            try {
                const tokenAddress = (0, tokens_1.getTokenAddress)(symbol);
                if (v2Router)
                    await ensureApproval(tokenAddress, v2Router, amount, this.wallet);
                if (v3Router)
                    await ensureApproval(tokenAddress, v3Router, amount, this.wallet);
            }
            catch (e) {
                this.logger.debug(`Skip approval for ${symbol}`, { error: e instanceof Error ? e.message : String(e) });
            }
        }
    }
    async executeSanityTransfer(to, amountWei) {
        try {
            const value = BigInt(amountWei);
            const txReq = {
                to,
                value,
            };
            const gasEstimate = await this.wallet.provider?.estimateGas?.(txReq);
            if (!gasEstimate)
                throw new Error('Failed to estimate gas for sanity transfer');
            const feeData = await this.wallet.provider?.getFeeData?.();
            if (!feeData)
                throw new Error('Failed to fetch fee data for sanity transfer');
            const tx = await this.wallet.sendTransaction({
                ...txReq,
                gasLimit: gasEstimate,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            });
            const receipt = await tx.wait();
            if (receipt?.status !== 1) {
                throw new Error('Sanity transfer transaction failed');
            }
            const gasPrice = this.getReceiptGasPrice(receipt);
            return {
                hash: tx.hash,
                success: true,
                gasUsed: receipt.gasUsed.toString(),
                gasPrice,
                profit: '0',
                timestamp: Date.now(),
            };
        }
        catch (error) {
            return {
                hash: '',
                success: false,
                gasUsed: '0',
                gasPrice: '0',
                profit: '0',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now(),
            };
        }
    }
    /**
     * Execute an arbitrage opportunity (executor contract or direct router on Sepolia)
     */
    async executeArbitrage(opportunity) {
        try {
            this.logger.info('Preparing arbitrage execution', {
                tokenA: opportunity.tokenA,
                tokenB: opportunity.tokenB,
                dex1: opportunity.dex1,
                dex2: opportunity.dex2,
                amountIn: opportunity.amountIn
            });
            const useDirectSwap = !this.executorAddress &&
                process.env['SEPOLIA_UNISWAP_V2_ROUTER']?.trim() &&
                process.env['SEPOLIA_UNISWAP_V3_ROUTER']?.trim();
            if (useDirectSwap) {
                return await this.executeSwapDirect(opportunity);
            }
            // Build transaction data (executor contract)
            const txData = await this.buildArbitrageTransaction(opportunity);
            // Estimate gas
            const gasEstimate = await this.wallet.provider?.estimateGas?.(txData);
            if (!gasEstimate)
                throw new Error('Failed to estimate gas');
            // Get current gas price
            const gasPrice = await this.wallet.provider?.getFeeData?.();
            if (!gasPrice)
                throw new Error('Failed to fetch gas price data');
            // Execute transaction
            const tx = await this.wallet.sendTransaction({
                ...txData,
                gasLimit: gasEstimate,
                maxFeePerGas: gasPrice?.maxFeePerGas,
                maxPriorityFeePerGas: gasPrice?.maxPriorityFeePerGas
            });
            this.logger.info('Arbitrage transaction sent', {
                hash: tx.hash,
                gasLimit: gasEstimate.toString(),
                gasPrice: gasPrice.maxFeePerGas?.toString() || ''
            });
            // Wait for confirmation
            const receipt = await tx.wait();
            if (receipt?.status === 1) {
                this.logger.info('Arbitrage executed successfully', {
                    hash: tx.hash,
                    gasUsed: receipt.gasUsed.toString(),
                    effectiveGasPrice: this.getReceiptGasPrice(receipt)
                });
                return {
                    hash: tx.hash,
                    success: true,
                    gasUsed: receipt.gasUsed.toString(),
                    gasPrice: this.getReceiptGasPrice(receipt),
                    profit: opportunity.profit,
                    timestamp: Date.now()
                };
            }
            else {
                throw new Error('Transaction failed');
            }
        }
        catch (error) {
            this.logger.error('Arbitrage execution failed', {
                error: error instanceof Error ? error.message : error,
                opportunity: {
                    tokenA: opportunity.tokenA,
                    tokenB: opportunity.tokenB,
                    dex1: opportunity.dex1,
                    dex2: opportunity.dex2
                }
            });
            return {
                hash: '',
                success: false,
                gasUsed: '0',
                gasPrice: '0',
                profit: '0',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            };
        }
    }
    static V2_ROUTER_ABI = [
        'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    ];
    static V3_ROUTER_ABI = [
        'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)',
    ];
    /**
     * Execute a single swap on the DEX with better price (Sepolia direct router path).
     */
    async executeSwapDirect(opportunity) {
        const tokenInAddr = (0, tokens_1.getTokenAddress)(opportunity.tokenA);
        const tokenOutAddr = (0, tokens_1.getTokenAddress)(opportunity.tokenB);
        const amountIn = ethers_1.ethers.getBigInt(opportunity.amountIn);
        const amountOut1 = ethers_1.ethers.getBigInt(opportunity.amountOut1);
        const amountOut2 = ethers_1.ethers.getBigInt(opportunity.amountOut2);
        const slippageBps = 50; // 0.5%
        const expectedOut = amountOut1 >= amountOut2 ? amountOut1 : amountOut2;
        const amountOutMin = (expectedOut * BigInt(10000 - slippageBps)) / BigInt(10000);
        const deadline = Math.floor(Date.now() / 1000) + 60;
        const v3RouterAddr = resolveAddress('SEPOLIA_UNISWAP_V3_ROUTER', 'UNISWAP_V3_ROUTER', 'SEPOLIA_UNISWAP_V3_ROUTER');
        const v2RouterResolved = resolveAddress('SEPOLIA_UNISWAP_V2_ROUTER', 'UNISWAP_V2_ROUTER', 'SEPOLIA_UNISWAP_V2_ROUTER');
        if (!v2RouterResolved || !v3RouterAddr) {
            throw new Error('Missing router configuration for direct swap execution');
        }
        if (isEthereumSepoliaProfile() && normalizeAddress(v2RouterResolved) === MAINNET_V2_ROUTER) {
            throw new Error('Invalid Sepolia config: router points to mainnet 0x7a25...');
        }
        const v2RouterAddr = v2RouterResolved;
        const v3Fee = 3000;
        const swapOnV2 = amountOut1 >= amountOut2 ? opportunity.dex1 === 'UNISWAP_V2' : opportunity.dex2 === 'UNISWAP_V2';
        console.log('[EXEC_ATTEMPT]', {
            pair: `${opportunity.tokenA}/${opportunity.tokenB}`,
            buyDex: swapOnV2 ? 'UNISWAP_V2' : 'UNISWAP_V3',
            amountIn: opportunity.amountIn,
            amountOutMin: amountOutMin.toString(),
        });
        try {
            let tx;
            if (swapOnV2) {
                const router = new ethers_1.ethers.Contract(v2RouterAddr, ExecutionService.V2_ROUTER_ABI, this.wallet);
                tx = await router.swapExactTokensForTokens(amountIn, amountOutMin, [tokenInAddr, tokenOutAddr], this.wallet.address, deadline);
            }
            else {
                const router = new ethers_1.ethers.Contract(v3RouterAddr, ExecutionService.V3_ROUTER_ABI, this.wallet);
                tx = await router.exactInputSingle({
                    tokenIn: tokenInAddr,
                    tokenOut: tokenOutAddr,
                    fee: v3Fee,
                    recipient: this.wallet.address,
                    amountIn,
                    amountOutMinimum: amountOutMin,
                    sqrtPriceLimitX96: 0n,
                });
            }
            const receipt = await tx.wait();
            if (!receipt) {
                throw new Error('Swap transaction receipt was null');
            }
            const gasPrice = this.getReceiptGasPrice(receipt);
            console.log('[EXEC_OK]', { hash: receipt.hash, gasUsed: receipt.gasUsed.toString() });
            return {
                hash: receipt.hash,
                success: true,
                gasUsed: receipt.gasUsed.toString(),
                gasPrice,
                profit: opportunity.profit,
                timestamp: Date.now(),
            };
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('[EXEC_FAIL]', { error: message });
            return {
                hash: '',
                success: false,
                gasUsed: '0',
                gasPrice: '0',
                profit: '0',
                error: message,
                timestamp: Date.now(),
            };
        }
    }
    /**
     * Build arbitrage transaction data
     */
    async buildArbitrageTransaction(opportunity) {
        const executorContract = new ethers_1.ethers.Contract(this.executorAddress, [
            'function executeArbV2V3(address tokenA, address tokenB, uint256 amountIn, address v2Router, address v3Router, uint24 v3Fee, uint256 minOutV2, uint256 minOutV3, uint256 deadline) external'
        ], this.wallet);
        // Get router addresses
        const dex1Config = config_1.DEX_CONFIG[opportunity.dex1];
        const dex2Config = config_1.DEX_CONFIG[opportunity.dex2];
        if (!dex1Config || !dex2Config) {
            throw new Error('Invalid DEX configuration');
        }
        // Determine which DEX is V2 and which is V3
        let v2Router;
        let v3Router;
        let v3Fee;
        if (dex1Config.version === 'v2' && dex2Config.version === 'v3') {
            v2Router = dex1Config.router;
            v3Router = dex2Config.router;
            v3Fee = dex2Config.feeTiers?.[1] || 3000;
        }
        else if (dex1Config.version === 'v3' && dex2Config.version === 'v2') {
            v2Router = dex2Config.router;
            v3Router = dex1Config.router;
            v3Fee = dex1Config.feeTiers?.[1] || 3000;
        }
        else {
            throw new Error('Unsupported DEX combination - need one V2 and one V3');
        }
        // Calculate minimum outputs with slippage protection
        const minOutV2 = this.calculateMinOutput(opportunity.amountOut1, 0.5); // 0.5% slippage
        const minOutV3 = this.calculateMinOutput(opportunity.amountOut2, 0.5); // 0.5% slippage
        // Set deadline (5 minutes from now)
        const deadline = Math.floor(Date.now() / 1000) + 300;
        const txData = await executorContract['executeArbV2V3']?.populateTransaction(opportunity.tokenA, opportunity.tokenB, opportunity.amountIn, v2Router, v3Router, v3Fee, minOutV2, minOutV3, deadline);
        if (!txData || !txData.data)
            throw new Error('Failed to build transaction data');
        return {
            to: this.executorAddress,
            data: txData.data,
            value: 0
        };
    }
    /**
     * Calculate minimum output with slippage protection
     */
    calculateMinOutput(amountOut, slippagePercent) {
        const amountOutBig = ethers_1.ethers.getBigInt(amountOut);
        const slippageMultiplier = BigInt(Math.floor((100 - slippagePercent) * 100));
        const denominator = BigInt(10000);
        return ((amountOutBig * slippageMultiplier) / denominator).toString();
    }
    /**
     * Simulate arbitrage transaction
     */
    async simulateArbitrage(opportunity) {
        try {
            const txData = await this.buildArbitrageTransaction(opportunity);
            const gasEstimate = await this.wallet.provider?.estimateGas?.(txData);
            if (!gasEstimate) {
                return {
                    success: false,
                    gasUsed: '0'
                };
            }
            return {
                success: true,
                gasUsed: gasEstimate.toString()
            };
        }
        catch (error) {
            return {
                success: false,
                gasUsed: '0',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get contract balance
     */
    async getContractBalance(tokenAddress) {
        try {
            const executorContract = new ethers_1.ethers.Contract(this.executorAddress, [
                'function getBalance(address token) external view returns (uint256)'
            ], this.wallet.provider);
            const balance = await executorContract['getBalance']?.(tokenAddress);
            return balance ? balance.toString() : '0';
        }
        catch (error) {
            this.logger.error('Failed to get contract balance', {
                error: error instanceof Error ? error.message : error,
                tokenAddress
            });
            return '0';
        }
    }
}
exports.ExecutionService = ExecutionService;
