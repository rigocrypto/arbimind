import { AIOrchestrator } from './ai/AIOrchestrator';
import { Logger } from './utils/Logger';

async function testAI() {
  const logger = new Logger('AITest');
  
  try {
    logger.info('Starting AI system test...');
    
    // Initialize AI orchestrator
    const aiOrchestrator = new AIOrchestrator();
    await aiOrchestrator.initialize();
    
    logger.info('AI orchestrator initialized successfully');
    
    // Create a sample arbitrage opportunity
    const sampleOpportunity = {
      tokenA: 'WETH',
      tokenB: 'USDC',
      dex1: 'UNISWAP_V2',
      dex2: 'UNISWAP_V3',
      amountIn: '1000000000000000000', // 1 ETH
      amountOut1: '1700000000', // from dex1
      amountOut2: '1800000000', // from dex2
      amountOut: '1800000000', // legacy field kept for compatibility
      profit: '50000000', // 50 USDC profit
      profitPercent: 2.8,
      gasEstimate: '250000',
      netProfit: '50000000',
      route: 'UNISWAP_V2 -> UNISWAP_V3',
      timestamp: Date.now()
    };
    
    logger.info('Testing AI prediction with sample opportunity...');
    
    // Get AI prediction
    const prediction = await aiOrchestrator.getPrediction(sampleOpportunity);
    
    logger.info('AI prediction generated successfully:', {
      opportunity: {
        probability: prediction.opportunity.probability.toFixed(3),
        expectedProfit: prediction.opportunity.expectedProfit.toFixed(6),
        confidence: prediction.opportunity.confidence.toFixed(3),
        recommendedAction: prediction.opportunity.recommendedAction
      },
      risk: {
        volatilityScore: prediction.risk.volatilityScore.toFixed(3),
        anomalyDetected: prediction.risk.anomalyDetected,
        recommendedSlippage: prediction.risk.recommendedSlippage.toFixed(2) + '%',
        gasPriceRecommendation: prediction.risk.gasPriceRecommendation + ' gwei'
      },
      execution: {
        optimalRoute: prediction.execution.optimalRoute.join(' → '),
        recommendedGasLimit: prediction.execution.recommendedGasLimit.toLocaleString(),
        useFlashLoan: prediction.execution.useFlashLoan,
        executionPriority: prediction.execution.executionPriority
      },
      sentiment: {
        overallSentiment: prediction.sentiment.overallSentiment.toFixed(3),
        marketMood: prediction.sentiment.marketMood,
        confidence: prediction.sentiment.confidence.toFixed(3)
      }
    });
    
    // Get AI system status
    const status = aiOrchestrator.getStatus();
    logger.info('AI system status:', status);
    
    logger.info('AI system test completed successfully! 🚀');
    
  } catch (error) {
    logger.error('AI system test failed:', {
      error: error instanceof Error ? error.message : error
    });
  }
}

// Run the test
testAI().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
