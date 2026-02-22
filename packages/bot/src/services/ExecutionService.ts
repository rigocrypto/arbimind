import { ethers } from 'ethers';
import { ArbitrageOpportunity, TransactionResult } from '../types';
import { Logger } from '../utils/Logger';
import { DEX_CONFIG } from '../config';

export class ExecutionService {
  private wallet: ethers.Wallet;
  private executorAddress: string;
  private logger: Logger;

  constructor(wallet: ethers.Wallet, executorAddress: string) {
    this.wallet = wallet;
    this.executorAddress = executorAddress;
    this.logger = new Logger('ExecutionService');
  }

  public async executeSanityTransfer(to: string, amountWei: string): Promise<TransactionResult> {
    try {
      const value = BigInt(amountWei);
      const txReq: ethers.TransactionRequest = {
        to,
        value,
      };

      const gasEstimate = await this.wallet.provider?.estimateGas?.(txReq);
      if (!gasEstimate) throw new Error('Failed to estimate gas for sanity transfer');

      const feeData = await this.wallet.provider?.getFeeData?.();
      if (!feeData) throw new Error('Failed to fetch fee data for sanity transfer');

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

      const gasPrice =
        (receipt as any).effectiveGasPrice
          ? (receipt as any).effectiveGasPrice.toString()
          : ((receipt as any).gasPrice ? (receipt as any).gasPrice.toString() : '0');

      return {
        hash: tx.hash,
        success: true,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice,
        profit: '0',
        timestamp: Date.now(),
      };
    } catch (error) {
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
   * Execute an arbitrage opportunity
   */
  public async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<TransactionResult> {
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
  if (!gasEstimate) throw new Error('Failed to estimate gas');

  // Get current gas price
  const gasPrice = await this.wallet.provider?.getFeeData?.();
  if (!gasPrice) throw new Error('Failed to fetch gas price data');
      
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
          effectiveGasPrice: (receipt as any).effectiveGasPrice ? (receipt as any).effectiveGasPrice.toString() : ((receipt as any).gasPrice ? (receipt as any).gasPrice.toString() : '0')
        });

        return {
          hash: tx.hash,
          success: true,
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: (receipt as any).effectiveGasPrice ? (receipt as any).effectiveGasPrice.toString() : ((receipt as any).gasPrice ? (receipt as any).gasPrice.toString() : '0'),
          profit: opportunity.profit,
          timestamp: Date.now()
        };
      } else {
        throw new Error('Transaction failed');
      }

    } catch (error) {
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
  private async buildArbitrageTransaction(opportunity: ArbitrageOpportunity): Promise<ethers.TransactionRequest> {
    const executorContract = new ethers.Contract(
      this.executorAddress,
      [
        'function executeArbV2V3(address tokenA, address tokenB, uint256 amountIn, address v2Router, address v3Router, uint24 v3Fee, uint256 minOutV2, uint256 minOutV3, uint256 deadline) external'
      ],
      this.wallet
    );

    // Get router addresses
    const dex1Config = DEX_CONFIG[opportunity.dex1];
    const dex2Config = DEX_CONFIG[opportunity.dex2];
    
    if (!dex1Config || !dex2Config) {
      throw new Error('Invalid DEX configuration');
    }

    // Determine which DEX is V2 and which is V3
    let v2Router: string;
    let v3Router: string;
    let v3Fee: number;

    if (dex1Config.version === 'v2' && dex2Config.version === 'v3') {
      v2Router = dex1Config.router;
      v3Router = dex2Config.router;
      v3Fee = dex2Config.feeTiers?.[1] || 3000;
    } else if (dex1Config.version === 'v3' && dex2Config.version === 'v2') {
      v2Router = dex2Config.router;
      v3Router = dex1Config.router;
      v3Fee = dex1Config.feeTiers?.[1] || 3000;
    } else {
      throw new Error('Unsupported DEX combination - need one V2 and one V3');
    }

    // Calculate minimum outputs with slippage protection
    const minOutV2 = this.calculateMinOutput(opportunity.amountOut1, 0.5); // 0.5% slippage
    const minOutV3 = this.calculateMinOutput(opportunity.amountOut2, 0.5); // 0.5% slippage

    // Set deadline (5 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 300;

    const txData = await executorContract['executeArbV2V3']?.populateTransaction(
      opportunity.tokenA,
      opportunity.tokenB,
      opportunity.amountIn,
      v2Router,
      v3Router,
      v3Fee,
      minOutV2,
      minOutV3,
      deadline
    );
  if (!txData || !txData.data) throw new Error('Failed to build transaction data');

    return {
      to: this.executorAddress,
      data: txData.data,
      value: 0
    };
  }

  /**
   * Calculate minimum output with slippage protection
   */
  private calculateMinOutput(amountOut: string, slippagePercent: number): string {
    const amountOutBig = ethers.getBigInt(amountOut);
    const slippageMultiplier = BigInt(Math.floor((100 - slippagePercent) * 100));
    const denominator = BigInt(10000);
    
    return ((amountOutBig * slippageMultiplier) / denominator).toString();
  }

  /**
   * Simulate arbitrage transaction
   */
  public async simulateArbitrage(opportunity: ArbitrageOpportunity): Promise<{ success: boolean; gasUsed: string; error?: string }> {
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
    } catch (error) {
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
  public async getContractBalance(tokenAddress: string): Promise<string> {
    try {
      const executorContract = new ethers.Contract(
        this.executorAddress,
        [
          'function getBalance(address token) external view returns (uint256)'
        ],
        this.wallet.provider
      );

      const balance = await executorContract['getBalance']?.(tokenAddress);
      return balance ? balance.toString() : '0';
    } catch (error) {
      this.logger.error('Failed to get contract balance', {
        error: error instanceof Error ? error.message : error,
        tokenAddress
      });
      return '0';
    }
  }
}
