"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionService = void 0;
const ethers_1 = require("ethers");
const Logger_1 = require("../utils/Logger");
const config_1 = require("../config");
class ExecutionService {
    wallet;
    executorAddress;
    logger;
    constructor(wallet, executorAddress) {
        this.wallet = wallet;
        this.executorAddress = executorAddress;
        this.logger = new Logger_1.Logger('ExecutionService');
    }
    /**
     * Execute an arbitrage opportunity
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
            // Build transaction data
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
                    effectiveGasPrice: receipt.effectiveGasPrice ? receipt.effectiveGasPrice.toString() : (receipt.gasPrice ? receipt.gasPrice.toString() : '0')
                });
                return {
                    hash: tx.hash,
                    success: true,
                    gasUsed: receipt.gasUsed.toString(),
                    gasPrice: receipt.effectiveGasPrice ? receipt.effectiveGasPrice.toString() : (receipt.gasPrice ? receipt.gasPrice.toString() : '0'),
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
//# sourceMappingURL=ExecutionService.js.map