import * as tf from '@tensorflow/tfjs-node';
import { AIPrediction, TrainingData } from '../config';
import { Logger } from '../../utils/Logger';

export class OpportunityDetectionModel {
  private model: tf.LayersModel | null = null;
  private logger: Logger;
  private isTraining: boolean = false;
  private lastTrainingTime: number = 0;

  constructor() {
    this.logger = new Logger('OpportunityDetectionModel');
  }

  /**
   * Initialize the model
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing opportunity detection model...');
      
      // Create a neural network for opportunity detection
      this.model = tf.sequential({
        layers: [
          // Input layer - 8 features
          tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [8]
          }),
          
          // Hidden layers
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({
            units: 32,
            activation: 'relu'
          }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({
            units: 16,
            activation: 'relu'
          }),
          
          // Output layer - probability of profitable opportunity
          tf.layers.dense({
            units: 1,
            activation: 'sigmoid'
          })
        ]
      });

      // Compile the model
      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });

      this.logger.info('Opportunity detection model initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize opportunity detection model', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Predict opportunity probability for given features
   */
  public async predict(features: Record<string, number>): Promise<AIPrediction['opportunity']> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      // Normalize and prepare features
      const normalizedFeatures = this.normalizeFeatures(features);
      const inputTensor = tf.tensor2d([normalizedFeatures], [1, 8]);
      
      // Make prediction
  const prediction = this.model.predict(inputTensor) as tf.Tensor;
  const probability = Number((await prediction.data())[0] ?? 0.5);
      
      // Calculate confidence and risk score
  const confidence = this.calculateConfidence(probability, features);
  const riskScore = this.calculateRiskScore(features);
  const expectedProfit = this.estimateExpectedProfit(features, probability);
      
      // Determine recommended action
      const recommendedAction = this.determineAction(probability, confidence, riskScore);
      
      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();
      
      return {
        probability,
        expectedProfit,
        confidence,
        riskScore,
        recommendedAction
      };
    } catch (error) {
      this.logger.error('Prediction failed', {
        error: error instanceof Error ? error.message : error
      });
      
      // Return default prediction
      return {
        probability: 0.5,
        expectedProfit: 0,
        confidence: 0.5,
        riskScore: 0.5,
        recommendedAction: 'wait'
      };
    }
  }

  /**
   * Train the model with historical data
   */
  public async train(trainingData: TrainingData[]): Promise<void> {
    if (!this.model || this.isTraining) {
      return;
    }

    try {
      this.isTraining = true;
      this.logger.info('Starting model training...', { dataPoints: trainingData.length });

      // Prepare training data
      const { features, labels } = this.prepareTrainingData(trainingData);
      
      // Convert to tensors
      const featuresTensor = tf.tensor2d(features);
      const labelsTensor = tf.tensor2d(labels, [labels.length, 1]);

      // Train the model
      const history = await this.model.fit(featuresTensor, labelsTensor, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
          this.logger.debug(`Epoch ${epoch + 1}: loss=${logs?.['loss']?.toFixed(4)}, accuracy=${logs?.['acc']?.toFixed(4)}`);
          }
        }
      });

      this.lastTrainingTime = Date.now();
      this.logger.info('Model training completed', {
  finalLoss: history.history['loss']?.[history.history['loss'].length - 1],
  finalAccuracy: history.history['acc']?.[history.history['acc'].length - 1]
      });

      // Clean up tensors
      featuresTensor.dispose();
      labelsTensor.dispose();

    } catch (error) {
      this.logger.error('Model training failed', {
        error: error instanceof Error ? error.message : error
      });
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Save the trained model
   */
  public async saveModel(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    try {
      await this.model.save(`file://${path}`);
      this.logger.info('Model saved successfully', { path });
    } catch (error) {
      this.logger.error('Failed to save model', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Load a trained model
   */
  public async loadModel(path: string): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(`file://${path}/model.json`);
      this.logger.info('Model loaded successfully', { path });
    } catch (error) {
      this.logger.error('Failed to load model', {
        error: error instanceof Error ? error.message : error
      });
      // Initialize new model if loading fails
      await this.initialize();
    }
  }

  /**
   * Normalize features for model input
   */
  private normalizeFeatures(features: Record<string, number>): number[] {
    const featureOrder = [
      'price_delta',
      'liquidity_ratio', 
      'volume_24h',
      'gas_price',
      'volatility',
      'market_sentiment',
      'competition_level',
      'historical_success_rate'
    ];

    return featureOrder.map(feature => {
      const value = features[feature] || 0;
      
      // Apply normalization based on feature type
      switch (feature) {
        case 'price_delta':
          return Math.tanh(value / 0.1); // Normalize to [-1, 1]
        case 'liquidity_ratio':
          return Math.min(value / 1000, 1); // Normalize to [0, 1]
        case 'volume_24h':
          return Math.log(1 + value) / 10; // Log normalization
        case 'gas_price':
          return Math.min(value / 100, 1); // Normalize to [0, 1]
        case 'volatility':
          return Math.tanh(value / 0.5); // Normalize to [-1, 1]
        case 'market_sentiment':
          return (value + 1) / 2; // Convert from [-1, 1] to [0, 1]
        case 'competition_level':
          return Math.min(value / 10, 1); // Normalize to [0, 1]
        case 'historical_success_rate':
          return value; // Already normalized [0, 1]
        default:
          return 0;
      }
    });
  }

  /**
   * Prepare training data from historical records
   */
  private prepareTrainingData(trainingData: TrainingData[]): { features: number[][], labels: number[] } {
    const features: number[][] = [];
    const labels: number[] = [];

    for (const data of trainingData) {
      const normalizedFeatures = this.normalizeFeatures(data.features);
      features.push(normalizedFeatures);
      
      // Label: 1 if profitable, 0 if not
      const label = data.target.profit > 0 ? 1 : 0;
      labels.push(label);
    }

    return { features, labels };
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(probability: number, features: Record<string, number>): number {
    // Base confidence on probability distance from 0.5
    const baseConfidence = Math.abs(probability - 0.5) * 2;
    
    // Adjust based on feature quality
    const liquidityQuality = Math.min((features['liquidity_ratio'] || 0) / 1000, 1);
    const volumeQuality = Math.min((features['volume_24h'] || 0) / 1000000, 1);
    
    return Math.min(baseConfidence * (liquidityQuality + volumeQuality) / 2, 1);
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(features: Record<string, number>): number {
    const volatilityRisk = features['volatility'] || 0;
    const gasRisk = Math.min((features['gas_price'] || 0) / 100, 1);
    const competitionRisk = features['competition_level'] || 0;
    
    return (volatilityRisk + gasRisk + competitionRisk) / 3;
  }

  /**
   * Estimate expected profit
   */
  private estimateExpectedProfit(features: Record<string, number>, probability: number): number {
    const baseProfit = features['price_delta'] || 0;
    const successRate = features['historical_success_rate'] || 0.5;
    
    return baseProfit * probability * successRate;
  }

  /**
   * Determine recommended action
   */
  private determineAction(probability: number, confidence: number, riskScore: number): 'execute' | 'wait' | 'skip' {
    if (probability > 0.8 && confidence > 0.7 && riskScore < 0.3) {
      return 'execute';
    } else if (probability > 0.6 && confidence > 0.5 && riskScore < 0.5) {
      return 'wait';
    } else {
      return 'skip';
    }
  }

  /**
   * Get model status
   */
  public getStatus(): { isInitialized: boolean; isTraining: boolean; lastTrainingTime: number } {
    return {
      isInitialized: this.model !== null,
      isTraining: this.isTraining,
      lastTrainingTime: this.lastTrainingTime
    };
  }
}
