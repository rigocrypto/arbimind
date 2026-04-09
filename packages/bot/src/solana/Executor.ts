import {
  Connection,
  Keypair,
  TransactionExpiredBlockheightExceededError,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { Logger } from '../utils/Logger';

export interface SolanaExecutorConfig {
  tradingEnabled: boolean;
  logOnly: boolean;
  canaryMode: boolean;
  maxNotionalUsd: number;
  minExpectedProfitUsd: number;
  maxDailyLossUsd: number;
  maxSlippageBps: number;
  rpcUrl: string;
  privateKeyBase58: string;
  jupiterBaseUrl: string;
}

export interface SwapOpportunity {
  inputMint: string;
  outputMint: string;
  amountLamports: number;
  estimatedNotionalUsd: number;
  expectedProfitUsd: number;
  label: string;
}

export interface ExecutionResult {
  success: boolean;
  signature?: string;
  error?: string;
  logOnly?: boolean;
  skipped?: boolean;
  skipReason?: string;
}

interface JupiterQuoteResponse {
  outAmount: string;
  priceImpactPct: string;
  routePlan: unknown[];
  [key: string]: unknown;
}

const CANARY_MAX_NOTIONAL_USD = 5;
const MAX_RETRIES = 3;
const CONFIRM_TIMEOUT_MS = 60_000;

let dailyLossUsd = 0;
let dailyLossResetAt = startOfDayUtc();

function startOfDayUtc(): number {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function resetDailyLossIfNeeded(): void {
  if (Date.now() >= dailyLossResetAt + 86_400_000) {
    dailyLossUsd = 0;
    dailyLossResetAt = startOfDayUtc();
  }
}

export class SolanaExecutor {
  private readonly config: SolanaExecutorConfig;
  private readonly logger = new Logger('SolanaExecutor');

  constructor(config: SolanaExecutorConfig) {
    this.config = config;
  }

  async execute(opportunity: SwapOpportunity): Promise<ExecutionResult> {
    resetDailyLossIfNeeded();

    if (!this.config.tradingEnabled) {
      return this.skip('SOLANA_TRADING_ENABLED is false', opportunity);
    }

    const maxNotionalUsd = this.config.canaryMode
      ? Math.min(this.config.maxNotionalUsd, CANARY_MAX_NOTIONAL_USD)
      : this.config.maxNotionalUsd;

    if (opportunity.estimatedNotionalUsd > maxNotionalUsd) {
      return this.skip(
        `notional $${opportunity.estimatedNotionalUsd.toFixed(2)} exceeds max $${maxNotionalUsd.toFixed(2)}`,
        opportunity
      );
    }

    if (opportunity.expectedProfitUsd < this.config.minExpectedProfitUsd) {
      return this.skip(
        `expected profit $${opportunity.expectedProfitUsd.toFixed(2)} below minimum $${this.config.minExpectedProfitUsd.toFixed(2)}`,
        opportunity
      );
    }

    if (dailyLossUsd >= this.config.maxDailyLossUsd) {
      return this.skip(
        `daily loss cap reached ($${dailyLossUsd.toFixed(2)} >= $${this.config.maxDailyLossUsd.toFixed(2)})`,
        opportunity
      );
    }

    let quoteResponse: JupiterQuoteResponse;
    try {
      quoteResponse = await this.fetchQuote(opportunity);
    } catch (error) {
      return {
        success: false,
        error: `quote failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (!quoteResponse.outAmount || quoteResponse.outAmount === '0') {
      return this.skip('Jupiter quote returned zero outAmount', opportunity);
    }

    const wallet = this.getWallet();
    if (!wallet) {
      return this.skip('missing or invalid SOLANA_PRIVATE_KEY_BASE58', opportunity);
    }

    let transaction: VersionedTransaction;
    try {
      transaction = await this.buildSwapTransaction(quoteResponse, wallet.publicKey.toBase58());
    } catch (error) {
      return {
        success: false,
        error: `swap build failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (this.config.logOnly) {
      this.logger.info('LOG_ONLY: built Solana swap transaction', {
        label: opportunity.label,
        inputMint: opportunity.inputMint,
        outputMint: opportunity.outputMint,
        estimatedNotionalUsd: opportunity.estimatedNotionalUsd,
        expectedProfitUsd: opportunity.expectedProfitUsd,
        outAmount: quoteResponse.outAmount,
        priceImpactPct: quoteResponse.priceImpactPct,
      });
      return { success: true, logOnly: true };
    }

    return this.signAndSend(transaction, wallet, opportunity);
  }

  private async fetchQuote(opportunity: SwapOpportunity): Promise<JupiterQuoteResponse> {
    const url = new URL(`${this.config.jupiterBaseUrl}/quote`);
    url.searchParams.set('inputMint', opportunity.inputMint);
    url.searchParams.set('outputMint', opportunity.outputMint);
    url.searchParams.set('amount', String(opportunity.amountLamports));
    url.searchParams.set('slippageBps', String(this.config.maxSlippageBps));
    url.searchParams.set('onlyDirectRoutes', 'false');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Jupiter quote HTTP ${response.status}`);
    }

    return response.json() as Promise<JupiterQuoteResponse>;
  }

  private async buildSwapTransaction(
    quoteResponse: JupiterQuoteResponse,
    userPublicKey: string
  ): Promise<VersionedTransaction> {
    const response = await fetch(`${this.config.jupiterBaseUrl}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`Jupiter swap build HTTP ${response.status}`);
    }

    const body = (await response.json()) as { swapTransaction?: string };
    if (!body.swapTransaction) {
      throw new Error('Jupiter swap response missing swapTransaction');
    }

    return VersionedTransaction.deserialize(Buffer.from(body.swapTransaction, 'base64'));
  }

  private async signAndSend(
    transaction: VersionedTransaction,
    wallet: Keypair,
    opportunity: SwapOpportunity
  ): Promise<ExecutionResult> {
    if (!this.config.rpcUrl) {
      return this.skip('missing SOLANA_RPC_URL', opportunity);
    }

    const connection = new Connection(this.config.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: CONFIRM_TIMEOUT_MS,
    });

    transaction.sign([wallet]);

    let lastError: string | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const signature = await connection.sendTransaction(transaction, {
          skipPreflight: false,
          maxRetries: 2,
        });

        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        if (confirmation.value.err) {
          lastError = `tx confirmed with error: ${JSON.stringify(confirmation.value.err)}`;
          continue;
        }

        this.logger.info('Solana swap confirmed', {
          signature,
          label: opportunity.label,
          estimatedNotionalUsd: opportunity.estimatedNotionalUsd,
          expectedProfitUsd: opportunity.expectedProfitUsd,
        });
        return { success: true, signature };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (error instanceof TransactionExpiredBlockheightExceededError) {
          break;
        }
        this.logger.warn(`Solana swap attempt ${attempt} failed`, {
          error: lastError,
          label: opportunity.label,
        });
      }
    }

    dailyLossUsd += opportunity.estimatedNotionalUsd * 0.01;
    return {
      success: false,
      error: lastError ?? 'unknown send failure',
    };
  }

  private getWallet(): Keypair | null {
    const privateKeyBase58 = this.config.privateKeyBase58.trim();
    if (!privateKeyBase58) {
      return null;
    }

    try {
      return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
    } catch (error) {
      this.logger.warn('Failed to decode SOLANA_PRIVATE_KEY_BASE58', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private skip(reason: string, opportunity: SwapOpportunity): ExecutionResult {
    this.logger.info(`Skipping Solana execution: ${reason}`, {
      label: opportunity.label,
      inputMint: opportunity.inputMint,
      outputMint: opportunity.outputMint,
    });
    return {
      success: false,
      skipped: true,
      skipReason: reason,
    };
  }
}