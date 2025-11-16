import { AIPrediction } from '../config';
export declare class SentimentAnalyzer {
    private logger;
    private sentimentCache;
    private cacheExpiry;
    constructor();
    /**
     * Analyze market sentiment from multiple sources
     */
    analyzeSentiment(tokenSymbol: string): Promise<AIPrediction['sentiment']>;
    /**
     * Get sentiment from Twitter (simulated)
     */
    private getTwitterSentiment;
    /**
     * Get sentiment from Reddit (simulated)
     */
    private getRedditSentiment;
    /**
     * Get sentiment from news sources (simulated)
     */
    private getNewsSentiment;
    /**
     * Get sentiment from Telegram (simulated)
     */
    private getTelegramSentiment;
    /**
     * Get current market condition (simulated)
     */
    private getMarketCondition;
    /**
     * Format sentiment result
     */
    private formatSentimentResult;
    /**
     * Get sentiment for multiple tokens
     */
    getBatchSentiment(tokenSymbols: string[]): Promise<Map<string, AIPrediction['sentiment']>>;
    /**
     * Clear sentiment cache
     */
    clearCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        entries: string[];
    };
}
//# sourceMappingURL=SentimentAnalyzer.d.ts.map