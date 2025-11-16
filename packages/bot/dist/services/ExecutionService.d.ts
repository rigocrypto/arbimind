import { ethers } from 'ethers';
import { ArbitrageOpportunity, TransactionResult } from '../types';
export declare class ExecutionService {
    private wallet;
    private executorAddress;
    private logger;
    constructor(wallet: ethers.Wallet, executorAddress: string);
    /**
     * Execute an arbitrage opportunity
     */
    executeArbitrage(opportunity: ArbitrageOpportunity): Promise<TransactionResult>;
    /**
     * Build arbitrage transaction data
     */
    private buildArbitrageTransaction;
    /**
     * Calculate minimum output with slippage protection
     */
    private calculateMinOutput;
    /**
     * Simulate arbitrage transaction
     */
    simulateArbitrage(opportunity: ArbitrageOpportunity): Promise<{
        success: boolean;
        gasUsed: string;
        error?: string;
    }>;
    /**
     * Get contract balance
     */
    getContractBalance(tokenAddress: string): Promise<string>;
}
//# sourceMappingURL=ExecutionService.d.ts.map