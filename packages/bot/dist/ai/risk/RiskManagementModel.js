"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManagementModel = void 0;
const Logger_1 = require("../../utils/Logger");
class RiskManagementModel {
    logger;
    volatilityHistory = [];
    anomalyThreshold = 2.0; // Standard deviations for anomaly detection
    maxHistorySize = 1000;
    constructor() {
        this.logger = new Logger_1.Logger('RiskManagementModel');
    }
    /**
     * Assess risk for an arbitrage opportunity
     */
    async assessRisk(marketData) {
        try {
            // Calculate volatility score
            const volatilityScore = this.calculateVolatilityScore(marketData.volatility);
            // Detect anomalies
            const anomalyDetected = this.detectAnomalies(marketData);
            // Calculate recommended slippage
            const recommendedSlippage = this.calculateRecommendedSlippage(marketData);
            // Calculate gas price recommendation
            const gasPriceRecommendation = this.calculateGasPriceRecommendation(marketData);
            return {
                volatilityScore,
                anomalyDetected,
                recommendedSlippage,
                gasPriceRecommendation
            };
        }
        catch (error) {
            this.logger.error('Risk assessment failed', {
                error: error instanceof Error ? error.message : error
            });
            // Return conservative risk assessment
            return {
                volatilityScore: 0.5,
                anomalyDetected: false,
                recommendedSlippage: 1.0, // 1% default slippage
                gasPriceRecommendation: 20 // 20 gwei default
            };
        }
    }
    /**
     * Calculate volatility score
     */
    calculateVolatilityScore(volatility) {
        // Normalize volatility to 0-1 scale
        // Higher volatility = higher risk score
        const normalizedVolatility = Math.min(volatility / 0.5, 1);
        // Apply sigmoid function for smooth scaling
        return 1 / (1 + Math.exp(-5 * (normalizedVolatility - 0.5)));
    }
    /**
     * Detect anomalies in market data
     */
    detectAnomalies(marketData) {
        try {
            // Add current volatility to history
            this.volatilityHistory.push(marketData.volatility);
            // Keep history size manageable
            if (this.volatilityHistory.length > this.maxHistorySize) {
                this.volatilityHistory = this.volatilityHistory.slice(-this.maxHistorySize);
            }
            // Need at least 10 data points for anomaly detection
            if (this.volatilityHistory.length < 10) {
                return false;
            }
            // Calculate mean and standard deviation
            const mean = this.volatilityHistory.reduce((sum, val) => sum + val, 0) / this.volatilityHistory.length;
            const variance = this.volatilityHistory.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / this.volatilityHistory.length;
            const stdDev = Math.sqrt(variance);
            // Check if current volatility is an anomaly
            const currentVolatility = marketData.volatility;
            const zScore = Math.abs(currentVolatility - mean) / stdDev;
            // Check for other anomalies
            const priceDeltaAnomaly = Math.abs(marketData.priceDelta) > 0.1; // 10% price delta
            const liquidityAnomaly = marketData.liquidity < 1000; // Low liquidity
            const gasPriceAnomaly = marketData.gasPrice > 100; // High gas price
            const competitionAnomaly = marketData.competitionLevel > 8; // High competition
            return zScore > this.anomalyThreshold ||
                priceDeltaAnomaly ||
                liquidityAnomaly ||
                gasPriceAnomaly ||
                competitionAnomaly;
        }
        catch (error) {
            this.logger.error('Anomaly detection failed', {
                error: error instanceof Error ? error.message : error
            });
            return false;
        }
    }
    /**
     * Calculate recommended slippage based on market conditions
     */
    calculateRecommendedSlippage(marketData) {
        let baseSlippage = 0.5; // 0.5% base slippage
        // Adjust for volatility
        const volatilityAdjustment = marketData.volatility * 2;
        // Adjust for liquidity
        const liquidityAdjustment = Math.max(0, (1000 - marketData.liquidity) / 1000) * 1.0;
        // Adjust for competition
        const competitionAdjustment = marketData.competitionLevel * 0.1;
        // Adjust for volume
        const volumeAdjustment = Math.max(0, (1000000 - marketData.volume) / 1000000) * 0.5;
        const totalAdjustment = volatilityAdjustment + liquidityAdjustment + competitionAdjustment + volumeAdjustment;
        const recommendedSlippage = Math.min(baseSlippage + totalAdjustment, 5.0); // Max 5%
        return Math.round(recommendedSlippage * 100) / 100; // Round to 2 decimal places
    }
    /**
     * Calculate gas price recommendation
     */
    calculateGasPriceRecommendation(marketData) {
        let baseGasPrice = 20; // 20 gwei base
        // Adjust for competition
        const competitionAdjustment = marketData.competitionLevel * 2;
        // Adjust for volatility (higher volatility = higher gas for faster execution)
        const volatilityAdjustment = marketData.volatility * 10;
        // Adjust for price delta (higher profit potential = higher gas)
        const profitAdjustment = Math.abs(marketData.priceDelta) * 50;
        const totalAdjustment = competitionAdjustment + volatilityAdjustment + profitAdjustment;
        const recommendedGasPrice = Math.min(baseGasPrice + totalAdjustment, 100); // Max 100 gwei
        return Math.round(recommendedGasPrice);
    }
    /**
     * Update model with execution results
     */
    updateModel(executionResult) {
        try {
            // Update volatility history
            this.volatilityHistory.push(executionResult.volatility);
            // Keep history size manageable
            if (this.volatilityHistory.length > this.maxHistorySize) {
                this.volatilityHistory = this.volatilityHistory.slice(-this.maxHistorySize);
            }
            // Log model update
            this.logger.debug('Risk model updated with execution result', {
                success: executionResult.success,
                profitAccuracy: executionResult.actualProfit / executionResult.expectedProfit,
                gasEfficiency: executionResult.gasUsed
            });
        }
        catch (error) {
            this.logger.error('Failed to update risk model', {
                error: error instanceof Error ? error.message : error
            });
        }
    }
    /**
     * Get risk model statistics
     */
    getModelStats() {
        const averageVolatility = this.volatilityHistory.length > 0
            ? this.volatilityHistory.reduce((sum, val) => sum + val, 0) / this.volatilityHistory.length
            : 0;
        return {
            volatilityHistorySize: this.volatilityHistory.length,
            averageVolatility,
            anomalyThreshold: this.anomalyThreshold,
            lastUpdate: Date.now()
        };
    }
    /**
     * Set anomaly detection sensitivity
     */
    setAnomalyThreshold(threshold) {
        this.anomalyThreshold = Math.max(0.5, Math.min(5.0, threshold));
        this.logger.info('Anomaly threshold updated', { threshold: this.anomalyThreshold });
    }
    /**
     * Clear model history
     */
    clearHistory() {
        this.volatilityHistory = [];
        this.logger.info('Risk model history cleared');
    }
}
exports.RiskManagementModel = RiskManagementModel;
//# sourceMappingURL=RiskManagementModel.js.map