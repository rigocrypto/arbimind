import {
  Connection,
  Keypair,
  PublicKey,
  TransactionExpiredBlockheightExceededError,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { createHash } from 'crypto';
import { Logger } from '../utils/Logger';

export interface SolanaExecutorConfig {
  tradingEnabled: boolean;
  logOnly: boolean;
  canaryMode: boolean;
  onlyDirectRoutes: boolean;
  allowMultihop: boolean;
  computeUnitLimit: number;
  priorityFeeMicroLamports: number;
  maxPriceImpactPct: number;
  ammDenylist: string[];
  ammAllowlist: string[];
  templateDenylist: string[];
  raydiumFingerprintDenylist: string[];
  asLegacyTransaction: boolean;
  tradeSizeMode: 'fixed' | 'dynamic';
  minSpreadBps: number;
  allocationPct: number;
  minTradeSizeUsd: number;
  maxTradeSizeUsd: number;
  drawdownTriggerPct: number;
  drawdownScale: number;
  maxNotionalUsd: number;
  minExpectedProfitUsd: number;
  maxDailyLossUsd: number;
  maxSlippageBps: number;
  quoteMaxAgeMs: number;
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
  spreadBps: number;
  label: string;
  quotedAtMs?: number;
}

export interface ExecutionResult {
  success: boolean;
  signature?: string;
  error?: string;
  logOnly?: boolean;
  skipped?: boolean;
  skipReason?: string;
}

interface RouteLeg {
  percent?: number | string;
  swapInfo?: {
    ammKey?: string;
    label?: string;
    inputMint?: string;
    outputMint?: string;
  };
  [key: string]: unknown;
}

interface AmmMeta {
  ammLabel: string;
  ammKey: string;
  inputMint: string;
  outputMint: string;
}

interface TxMeta {
  instructionCount: number;
  accountKeyCount: number;
  writableCount: number;
  signerCount: number;
  accountFingerprint: string;
  accountKeySample: string[];
  programIds: string[];
}

interface JupiterQuoteResponse {
  outAmount: string;
  priceImpactPct: string;
  routePlan: RouteLeg[];
  [key: string]: unknown;
}

interface SolanaSigner {
  keypair: Keypair;
  format: 'base58-64' | 'base58-32' | 'hex' | 'json-array-64' | 'json-array-32';
}

const CANARY_MAX_NOTIONAL_USD = 5;
const MAX_RETRIES = 1; // EXP-013: reduced from 3 — 0x1788 won't resolve on retry, cuts Helius 429s
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
  private startingBalanceUsd?: number;
  private signerLogged = false;

  constructor(config: SolanaExecutorConfig) {
    this.config = config;

    const effectiveMaxNotionalUsd = this.config.canaryMode
      ? Math.min(this.config.maxNotionalUsd, CANARY_MAX_NOTIONAL_USD)
      : this.config.maxNotionalUsd;

    this.logger.info('[SOLANA] runtime notional', {
      configuredMaxNotionalUsd: this.config.maxNotionalUsd,
      effectiveMaxNotionalUsd,
      minExpectedProfitUsd: this.config.minExpectedProfitUsd,
      minExpectedProfitEnvRaw: process.env['SOLANA_MIN_EXPECTED_PROFIT_USD'] || null,
      jupiterBaseUrl: this.config.jupiterBaseUrl,
      canaryMode: this.config.canaryMode,
      tradeSizeMode: this.config.tradeSizeMode,
      allocationPct: this.config.allocationPct,
      minTradeSizeUsd: this.config.minTradeSizeUsd,
      maxTradeSizeUsd: this.config.maxTradeSizeUsd,
      drawdownTriggerPct: this.config.drawdownTriggerPct,
      drawdownScale: this.config.drawdownScale,
      minSpreadBps: this.config.minSpreadBps,
      quoteMaxAgeMs: this.config.quoteMaxAgeMs,
      onlyDirectRoutes: this.config.onlyDirectRoutes,
      allowMultihop: this.config.allowMultihop,
      computeUnitLimit: this.config.computeUnitLimit,
      priorityFeeMicroLamports: this.config.priorityFeeMicroLamports,
      maxPriceImpactPct: this.config.maxPriceImpactPct,
      asLegacyTransaction: this.config.asLegacyTransaction,
      ammDenylistSize: this.config.ammDenylist.length,
      ammAllowlistSize: this.config.ammAllowlist.length,
      templateDenylistSize: this.config.templateDenylist.length,
      raydiumFingerprintDenylistSize: this.config.raydiumFingerprintDenylist.length,
    });

    if (this.config.tradingEnabled && !this.config.logOnly) {
      this.getWallet();
    }
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

    const signer = this.getWallet();
    if (!signer) {
      return this.skip('missing or invalid SOLANA_PRIVATE_KEY_BASE58', opportunity);
    }
    const wallet = signer.keypair;

    if (!this.config.rpcUrl) {
      return this.skip('missing SOLANA_RPC_URL', opportunity);
    }

    const connection = new Connection(this.config.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: CONFIRM_TIMEOUT_MS,
    });

    const sizedOpportunity = await this.applyPositionSizing(opportunity, connection, wallet.publicKey.toBase58());
    if (!sizedOpportunity) {
      return this.skip('unable to calculate dynamic trade size', opportunity);
    }

    if (sizedOpportunity.estimatedNotionalUsd > maxNotionalUsd) {
      return this.skip(
        `notional $${sizedOpportunity.estimatedNotionalUsd.toFixed(2)} exceeds max $${maxNotionalUsd.toFixed(2)}`,
        sizedOpportunity
      );
    }

    if (sizedOpportunity.expectedProfitUsd < this.config.minExpectedProfitUsd) {
      return this.skip(
        `expected profit $${sizedOpportunity.expectedProfitUsd.toFixed(2)} below minimum $${this.config.minExpectedProfitUsd.toFixed(2)}`,
        sizedOpportunity
      );
    }

    let quoteResponse: JupiterQuoteResponse;
    const quoteRequestedAtMs = Date.now();
    try {
      quoteResponse = await this.fetchQuote(sizedOpportunity);
      sizedOpportunity.quotedAtMs = quoteRequestedAtMs;
    } catch (error) {
      return {
        success: false,
        error: `quote failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const routePlan = (quoteResponse.routePlan as RouteLeg[]) ?? [];
    const firstLeg = routePlan[0]?.swapInfo ?? {};
    const quoteRecord = quoteResponse as Record<string, unknown>;
    this.logger.info('[SOLANA] quote diagnostics', {
      ammLabel: String(firstLeg.label ?? 'unknown'),
      ammKey: String(firstLeg.ammKey ?? 'unknown'),
      inputMint: String(quoteRecord['inputMint'] ?? sizedOpportunity.inputMint),
      outputMint: String(quoteRecord['outputMint'] ?? sizedOpportunity.outputMint),
      inAmount: String(quoteRecord['inAmount'] ?? sizedOpportunity.amountLamports),
      outAmount: quoteResponse.outAmount,
      slippageBps: this.config.maxSlippageBps,
      priceImpactPct: quoteResponse.priceImpactPct,
      routeLegs: routePlan.length,
      routePlan,
    });

    const { pass, rejectReason } = this.validateRoute(quoteResponse);
    if (!pass) {
      this.logger.info('[SOLANA] route rejected', {
        label: sizedOpportunity.label,
        rejectReason,
      });
      return {
        success: false,
        skipped: true,
        skipReason: `route filter: ${rejectReason}`,
      };
    }

    const ammMeta: AmmMeta = {
      ammLabel: String(firstLeg.label ?? 'unknown'),
      ammKey: String(firstLeg.ammKey ?? 'unknown'),
      inputMint: String(firstLeg.inputMint ?? sizedOpportunity.inputMint),
      outputMint: String(firstLeg.outputMint ?? sizedOpportunity.outputMint),
    };
    this.logger.info('[SOLANA] amm diagnostics', {
      ...ammMeta,
      priceImpactPct: quoteResponse.priceImpactPct,
      outAmount: quoteResponse.outAmount,
    });

    const ammCheck = this.validateAmm(quoteResponse);
    if (!ammCheck.pass) {
      this.logger.info('[SOLANA] route rejected (amm)', {
        label: ammCheck.label,
        ammKey: ammCheck.ammKey,
        rejectReason: ammCheck.rejectReason,
      });
      return {
        success: false,
        skipped: true,
        skipReason: `amm filter: ${ammCheck.rejectReason} label=${ammCheck.label}`,
      };
    }

    if (!quoteResponse.outAmount || quoteResponse.outAmount === '0') {
      return this.skip('Jupiter quote returned zero outAmount', opportunity);
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
        inputMint: sizedOpportunity.inputMint,
        outputMint: sizedOpportunity.outputMint,
        estimatedNotionalUsd: sizedOpportunity.estimatedNotionalUsd,
        expectedProfitUsd: sizedOpportunity.expectedProfitUsd,
        outAmount: quoteResponse.outAmount,
        priceImpactPct: quoteResponse.priceImpactPct,
      });
      return { success: true, logOnly: true };
    }

    this.logger.info('[SOLANA] swap attempt', {
      ...ammMeta,
      notionalUsd: sizedOpportunity.estimatedNotionalUsd,
      expectedProfitUsd: sizedOpportunity.expectedProfitUsd,
    });

    return this.signAndSend(transaction, wallet, sizedOpportunity, connection, ammMeta);
  }

  private async fetchQuote(opportunity: SwapOpportunity): Promise<JupiterQuoteResponse> {
    const url = new URL(`${this.config.jupiterBaseUrl}/quote`);
    url.searchParams.set('inputMint', opportunity.inputMint);
    url.searchParams.set('outputMint', opportunity.outputMint);
    url.searchParams.set('amount', String(opportunity.amountLamports));
    url.searchParams.set('slippageBps', String(this.config.maxSlippageBps));
    url.searchParams.set('onlyDirectRoutes', String(this.config.onlyDirectRoutes));

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Jupiter quote HTTP ${response.status}`);
    }

    return response.json() as Promise<JupiterQuoteResponse>;
  }

  private validateRoute(quote: JupiterQuoteResponse): {
    pass: boolean;
    rejectReason?: string;
  } {
    const routePlan: RouteLeg[] = (quote.routePlan as RouteLeg[]) ?? [];

    if (routePlan.length > 1 && !this.config.allowMultihop) {
      return {
        pass: false,
        rejectReason: `multi-hop route (${routePlan.length} legs)`,
      };
    }

    const hasSplit = routePlan.some((leg) => Number(leg.percent ?? 100) < 100);
    if (hasSplit) {
      return { pass: false, rejectReason: 'split route detected' };
    }

    const priceImpactPct = Number(quote.priceImpactPct ?? 0);
    if (priceImpactPct > this.config.maxPriceImpactPct) {
      return {
        pass: false,
        rejectReason: `price impact ${priceImpactPct.toFixed(3)}% > max ${this.config.maxPriceImpactPct}%`,
      };
    }

    return { pass: true };
  }

  private validateAmm(quote: JupiterQuoteResponse): {
    pass: boolean;
    rejectReason?: string;
    label: string;
    ammKey: string;
  } {
    const firstLeg = (quote.routePlan as RouteLeg[])?.[0]?.swapInfo ?? {};
    const label = String(firstLeg.label ?? '');
    const ammKey = String(firstLeg.ammKey ?? '');

    if (this.config.ammAllowlist.length > 0) {
      const allowed =
        this.config.ammAllowlist.includes(label) ||
        this.config.ammAllowlist.includes(ammKey);
      if (!allowed) {
        return { pass: false, rejectReason: 'amm_not_allowlisted', label, ammKey };
      }
    }

    const denied =
      this.config.ammDenylist.includes(label) ||
      this.config.ammDenylist.includes(ammKey);
    if (denied) {
      return { pass: false, rejectReason: 'amm_denylisted', label, ammKey };
    }

    return { pass: true, label, ammKey };
  }

  private extractTxMeta(transaction: VersionedTransaction): TxMeta {
    try {
      const message = transaction.message as unknown as {
        header?: {
          numRequiredSignatures?: number;
          numReadonlySignedAccounts?: number;
          numReadonlyUnsignedAccounts?: number;
        };
        staticAccountKeys?: PublicKey[];
        accountKeys?: PublicKey[];
        compiledInstructions?: Array<{ programIdIndex: number }>;
      };
      const accountKeys =
        message.staticAccountKeys ??
        message.accountKeys ??
        [];
      const instructions = message.compiledInstructions ?? [];
      const keyStrings = accountKeys.map((key) => key.toString());
      const signerCount = message.header?.numRequiredSignatures ?? 0;
      const readonlySigned = message.header?.numReadonlySignedAccounts ?? 0;
      const readonlyUnsigned = message.header?.numReadonlyUnsignedAccounts ?? 0;
      const writableSigned = Math.max(0, signerCount - readonlySigned);
      const unsignedCount = Math.max(0, accountKeys.length - signerCount);
      const writableUnsigned = Math.max(0, unsignedCount - readonlyUnsigned);
      const writableCount = writableSigned + writableUnsigned;
      const programIds = instructions
        .map((ix) => accountKeys[ix.programIdIndex]?.toString() ?? 'unknown')
        .filter((programId) => programId !== 'unknown');
      const fingerprintSource = keyStrings.join('|');
      const accountFingerprint = createHash('sha256')
        .update(fingerprintSource)
        .digest('hex')
        .slice(0, 16);
      const accountKeySample = keyStrings.slice(0, 8);

      return {
        instructionCount: instructions.length,
        accountKeyCount: accountKeys.length,
        writableCount,
        signerCount,
        accountFingerprint,
        accountKeySample,
        programIds: [...new Set(programIds)],
      };
    } catch {
      return {
        instructionCount: -1,
        accountKeyCount: -1,
        writableCount: -1,
        signerCount: -1,
        accountFingerprint: 'unknown',
        accountKeySample: [],
        programIds: [],
      };
    }
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
        dynamicComputeUnitLimit: false,
        computeUnitPriceMicroLamports: this.config.priorityFeeMicroLamports,
        computeUnitLimit: this.config.computeUnitLimit,
        asLegacyTransaction: this.config.asLegacyTransaction,
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
    opportunity: SwapOpportunity,
    connection: Connection,
    ammMeta: AmmMeta
  ): Promise<ExecutionResult> {
    const quoteAgeMs = opportunity.quotedAtMs ? Date.now() - opportunity.quotedAtMs : Number.NaN;
    if (Number.isFinite(quoteAgeMs) && quoteAgeMs > this.config.quoteMaxAgeMs) {
      return this.skip(
        `quote stale (${quoteAgeMs}ms > ${this.config.quoteMaxAgeMs}ms)`,
        opportunity
      );
    }

    transaction.sign([wallet]);
    const txMeta = this.extractTxMeta(transaction);
    const templateKey = `${ammMeta.ammLabel}|${txMeta.accountFingerprint}`;

    if (
      ammMeta.ammLabel === 'Raydium CLMM' &&
      this.config.raydiumFingerprintDenylist.length > 0 &&
      this.config.raydiumFingerprintDenylist.includes(txMeta.accountFingerprint)
    ) {
      this.logger.warn('[SOLANA_RAYDIUM_FP_DENYLIST] rejected known-bad raydium fingerprint', {
        fingerprintHash: txMeta.accountFingerprint,
        ...ammMeta,
        instructionCount: txMeta.instructionCount,
        accountKeyCount: txMeta.accountKeyCount,
        writableCount: txMeta.writableCount,
        signerCount: txMeta.signerCount,
      });
      return {
        success: false,
        skipped: true,
        skipReason: `raydium_fp_denied: ${txMeta.accountFingerprint}`,
      };
    }

    if (this.config.templateDenylist.includes(templateKey)) {
      this.logger.warn('[SOLANA_DENYLIST] rejected known-bad template', {
        templateKey,
        ...ammMeta,
        instructionCount: txMeta.instructionCount,
        accountKeyCount: txMeta.accountKeyCount,
        writableCount: txMeta.writableCount,
        signerCount: txMeta.signerCount,
      });
      return {
        success: false,
        skipped: true,
        skipReason: `template denylist: ${templateKey}`,
      };
    }

    this.logger.info('[SOLANA] tx diagnostics', {
      ...ammMeta,
      asLegacyTransaction: this.config.asLegacyTransaction,
      computeUnitLimit: this.config.computeUnitLimit,
      priorityFeeMicroLamports: this.config.priorityFeeMicroLamports,
      instructionCount: txMeta.instructionCount,
      accountKeyCount: txMeta.accountKeyCount,
      writableCount: txMeta.writableCount,
      signerCount: txMeta.signerCount,
      accountFingerprint: txMeta.accountFingerprint,
      programIds: txMeta.programIds,
    });

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
          ...ammMeta,
        });
        this.logger.info('[SOLANA] swap confirmed', {
          signature,
          ...ammMeta,
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
          instructionCount: txMeta.instructionCount,
          accountKeyCount: txMeta.accountKeyCount,
          writableCount: txMeta.writableCount,
          signerCount: txMeta.signerCount,
          accountFingerprint: txMeta.accountFingerprint,
          programIds: txMeta.programIds,
          ...ammMeta,
        });
        this.logger.error('[SOLANA] swap failed', {
          attempt,
          ...ammMeta,
          error: lastError,
          instructionCount: txMeta.instructionCount,
          accountKeyCount: txMeta.accountKeyCount,
          writableCount: txMeta.writableCount,
          signerCount: txMeta.signerCount,
          accountFingerprint: txMeta.accountFingerprint,
          programIds: txMeta.programIds,
          accountKeySample: attempt === 1 ? txMeta.accountKeySample : undefined,
        });
      }
    }

    dailyLossUsd += opportunity.estimatedNotionalUsd * 0.01;
    return {
      success: false,
      error: lastError ?? 'unknown send failure',
    };
  }

  private getWallet(): SolanaSigner | null {
    const privateKeyBase58 = this.config.privateKeyBase58.trim();
    if (!privateKeyBase58) {
      return null;
    }

    try {
      const decoded = bs58.decode(privateKeyBase58);
      if (decoded.length === 64) {
        const keypair = Keypair.fromSecretKey(decoded);
        this.logSignerLoaded(keypair, 'base58-64');
        return { keypair, format: 'base58-64' };
      }

      if (decoded.length === 32) {
        const keypair = Keypair.fromSeed(decoded);
        this.logSignerLoaded(keypair, 'base58-32');
        return { keypair, format: 'base58-32' };
      }
    } catch {
      // Continue to alternative parsers below.
    }

    try {
      if (/^[0-9a-fA-F]{64}$/.test(privateKeyBase58)) {
        const keypair = Keypair.fromSeed(Uint8Array.from(Buffer.from(privateKeyBase58, 'hex')));
        this.logSignerLoaded(keypair, 'hex');
        return { keypair, format: 'hex' };
      }

      if (privateKeyBase58.startsWith('[') && privateKeyBase58.endsWith(']')) {
        const parsed = JSON.parse(privateKeyBase58) as number[];
        if (Array.isArray(parsed) && parsed.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
          const bytes = Uint8Array.from(parsed);
          if (bytes.length === 64) {
            const keypair = Keypair.fromSecretKey(bytes);
            this.logSignerLoaded(keypair, 'json-array-64');
            return { keypair, format: 'json-array-64' };
          }

          if (bytes.length === 32) {
            const keypair = Keypair.fromSeed(bytes);
            this.logSignerLoaded(keypair, 'json-array-32');
            return { keypair, format: 'json-array-32' };
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to decode SOLANA_PRIVATE_KEY_BASE58', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.logger.warn('Failed to decode SOLANA_PRIVATE_KEY_BASE58', {
      error: 'unsupported key format (expected base58 secret/seed, 64-char hex seed, or JSON byte array)',
    });
    return null;
  }

  private logSignerLoaded(
    keypair: Keypair,
    detectedFormat: 'base58-64' | 'base58-32' | 'hex' | 'json-array-64' | 'json-array-32'
  ): void {
    if (this.signerLogged) {
      return;
    }

    this.signerLogged = true;
    this.logger.info('[SOLANA_SIGNER] keypair loaded', {
      publicKey: keypair.publicKey.toBase58(),
      format: detectedFormat,
    });
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

  private async applyPositionSizing(
    opportunity: SwapOpportunity,
    connection: Connection,
    walletPublicKey: string
  ): Promise<SwapOpportunity | null> {
    if (this.config.tradeSizeMode !== 'dynamic') {
      return opportunity;
    }

    const balanceUsd = await this.fetchInputBalanceUsd(connection, walletPublicKey, opportunity.inputMint);
    if (!Number.isFinite(balanceUsd) || balanceUsd <= 0) {
      this.logger.warn('Dynamic sizing failed: no positive input balance', {
        label: opportunity.label,
        inputMint: opportunity.inputMint,
        balanceUsd,
      });
      return null;
    }

    if (this.startingBalanceUsd === undefined) {
      this.startingBalanceUsd = balanceUsd;
    }

    const proposedSizeUsd = balanceUsd * this.config.allocationPct;
    if (proposedSizeUsd < this.config.minTradeSizeUsd) {
      this.logger.info('Skipping Solana execution: dynamic size below minimum threshold', {
        label: opportunity.label,
        proposedSizeUsd,
        minTradeSizeUsd: this.config.minTradeSizeUsd,
      });
      return null;
    }

    const hardMaxUsd = Math.min(this.config.maxTradeSizeUsd, this.config.maxNotionalUsd);
    let targetSizeUsd = Math.min(proposedSizeUsd, hardMaxUsd);

    if (balanceUsd < this.startingBalanceUsd * this.config.drawdownTriggerPct) {
      targetSizeUsd *= this.config.drawdownScale;
    }

    targetSizeUsd = Math.max(1, Math.min(targetSizeUsd, hardMaxUsd));

    const scale = targetSizeUsd / Math.max(opportunity.estimatedNotionalUsd, 1e-9);
    return {
      ...opportunity,
      amountLamports: Math.max(1, Math.round(opportunity.amountLamports * scale)),
      estimatedNotionalUsd: targetSizeUsd,
      expectedProfitUsd: opportunity.expectedProfitUsd * scale,
    };
  }

  private async fetchInputBalanceUsd(
    connection: Connection,
    walletPublicKey: string,
    inputMint: string
  ): Promise<number> {
    const owner = new PublicKey(walletPublicKey);
    const wrappedSolMint = 'So11111111111111111111111111111111111111112';
    const stableMints = new Set([
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT (canonical)
      'Es9vMFrzaCERmJfrF4H2fyQ4h6fW9rVYJ7YfBfY2n7V', // USDT (legacy variant)
    ]);

    if (inputMint === wrappedSolMint) {
      const lamports = await connection.getBalance(owner, 'confirmed');
      const solBalance = lamports / 1_000_000_000;
      const solPriceUsd = await this.fetchSolPriceUsd();
      return solBalance * solPriceUsd;
    }

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
      mint: new PublicKey(inputMint),
    }, 'confirmed');

    if (tokenAccounts.value.length === 0) {
      return 0;
    }

    let rawAmount = 0;
    let decimals = 0;
    for (const account of tokenAccounts.value) {
      const parsed = account.account.data.parsed as {
        info?: { tokenAmount?: { amount?: string; decimals?: number } };
      };
      const tokenAmount = parsed.info?.tokenAmount;
      if (!tokenAmount) {
        continue;
      }

      rawAmount += Number(tokenAmount.amount || '0');
      decimals = tokenAmount.decimals ?? decimals;
    }

    const tokenAmount = rawAmount / 10 ** decimals;
    if (stableMints.has(inputMint)) {
      return tokenAmount;
    }

    return 0;
  }

  private async fetchSolPriceUsd(): Promise<number> {
    const url = new URL(`${this.config.jupiterBaseUrl}/quote`);
    url.searchParams.set('inputMint', 'So11111111111111111111111111111111111111112');
    url.searchParams.set('outputMint', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    url.searchParams.set('amount', '1000000000');
    url.searchParams.set('slippageBps', '50');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Jupiter SOL price HTTP ${response.status}`);
    }

    const quote = await response.json() as JupiterQuoteResponse;
    const outAmount = Number(quote.outAmount || '0');
    if (!Number.isFinite(outAmount) || outAmount <= 0) {
      throw new Error('Jupiter SOL price returned invalid outAmount');
    }

    return outAmount / 1_000_000;
  }
}