import { AIPrediction } from '../config';
export declare class RiskManagementModel {
    private logger;
    private volatilityHistory;
    private anomalyThreshold;
    private maxHistorySize;
    constructor();
    /**
     * Assess risk for an arbitrage opportunity
     */
    assessRisk(marketData: {
        priceDelta: number;
        liquidity: number;
        volume: number;
        gasPrice: number;
        volatility: number;
        competitionLevel: number;
        historicalSuccessRate: number;
    }): Promise<AIPrediction['risk']>;
    /**
     * Calculate volatility score
     */
    private calculateVolatilityScore;
    /**
     * Detect anomalies in market data
     */
    private detectAnomalies;
    /**
     * Calculate recommended slippage based on market conditions
     */
    private calculateRecommendedSlippage;
    /**
     * Calculate gas price recommendation
     */
    private calculateGasPriceRecommendation;
    /**
     * Update model with execution results
     */
    updateModel(executionResult: {
        success: boolean;
        actualProfit: number;
        expectedProfit: number;
        gasUsed: number;
        slippage: number;
        volatility: number;
    }): void;
    /**
     * Get risk model statistics
     */
    getModelStats(): {
        volatilityHistorySize: number;
        averageVolatility: number;
        anomalyThreshold: number;
        lastUpdate: number;
    };
    /**
     * Set anomaly detection sensitivity
     */
    setAnomalyThreshold(threshold: number): void;
    /**
     * Clear model history
     */
    clearHistory(): void;
}
//# sourceMappingURL=RiskManagementModel.d.ts.map