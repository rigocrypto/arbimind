'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import toast from 'react-hot-toast';
import { Copy, ExternalLink, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import {
  getDevnetBalances,
  requestAirdrop,
  submitTransfer,
  type DevnetBalances,
  type AirdropResult,
  type TransferResult,
} from '@/lib/solanaApi';

// ─── Constants ──────────────────────────────────────────────────────

const EXPLORER_BASE = 'https://explorer.solana.com/tx';
const REFRESH_INTERVAL_MS = 15_000;
const AIRDROP_COOLDOWN_SEC = 30;
const RENT_RESERVE_SOL = 0.01;
const AIRDROP_AMOUNTS = [0.5, 1, 2] as const;
const ACTIVITY_STORAGE_KEY = 'arbimind_devnet_activity';
const MAX_ACTIVITY_ENTRIES = 20;

type TabId = 'airdrop' | 'deposit' | 'withdraw';

interface ActivityEntry {
  type: 'Airdrop' | 'Deposit' | 'Withdraw';
  amountSol: number;
  signature: string;
  status: 'confirmed' | 'failed';
  timestamp: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function explorerLink(sig: string): string {
  return `${EXPLORER_BASE}/${sig}?cluster=devnet`;
}

function relativeTime(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function loadActivity(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}

function saveActivity(entries: ActivityEntry[]): void {
  try {
    localStorage.setItem(
      ACTIVITY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ACTIVITY_ENTRIES)),
    );
  } catch { /* quota exceeded — ignore */ }
}

// ─── Component ──────────────────────────────────────────────────────

interface Props {
  treasuryPubkey?: string;
}

export function DevnetFundingPanel({ treasuryPubkey }: Props) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const TREASURY =
    treasuryPubkey ||
    process.env.NEXT_PUBLIC_SOLANA_ARB_ACCOUNT ||
    '9FxVFhrdWMj4ptKoBJjUmS1R24JGh4dMZu6eiPynf7z3';

  // ─── State ──────────────────────────────────────────────
  const [balances, setBalances] = useState<DevnetBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('airdrop');
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  // Airdrop
  const [airdropAmount, setAirdropAmount] = useState<number>(1);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // Deposit
  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);

  // ─── Computed values ────────────────────────────────────
  const walletAddr = publicKey?.toBase58() ?? '';
  const userSol = balances?.userWallet.solBalance ?? 0;
  const arbSol = balances?.arbAccount.solBalance ?? 0;
  const depositNum = parseFloat(depositAmount) || 0;
  const maxDeposit = Math.max(0, userSol - RENT_RESERVE_SOL);

  const depositWarning = useMemo(() => {
    if (depositNum <= 0) return null;
    if (depositNum > maxDeposit) return 'Insufficient balance (keep 0.01 SOL for fees)';
    if (depositNum > userSol * 0.8) return 'Keep some SOL for transaction fees';
    return null;
  }, [depositNum, maxDeposit, userSol]);

  const depositDisabled =
    !connected || depositLoading || depositNum <= 0 || depositNum > maxDeposit;

  // ─── Load activity from localStorage ────────────────────
  useEffect(() => {
    setActivity(loadActivity());
  }, []);

  // ─── Fetch balances ─────────────────────────────────────
  const refreshBalances = useCallback(async () => {
    if (!walletAddr) return;
    setLoading(true);
    try {
      const data = await getDevnetBalances(walletAddr);
      setBalances(data);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error('[DevnetFunding] balance fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [walletAddr]);

  // Auto-refresh on mount + interval
  useEffect(() => {
    if (!walletAddr) return;
    refreshBalances();
    const id = setInterval(refreshBalances, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [walletAddr, refreshBalances]);

  // ─── Cooldown countdown ─────────────────────────────────
  useEffect(() => {
    if (cooldownEnd <= Date.now()) {
      setCooldownLeft(0);
      return;
    }
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left <= 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  // ─── Airdrop handler ───────────────────────────────────
  const handleAirdrop = useCallback(async () => {
    if (!walletAddr) return;
    setAirdropLoading(true);
    try {
      const result: AirdropResult = await requestAirdrop(walletAddr, airdropAmount);
      if (result.success && result.signature) {
        toast.success(`Airdrop ${airdropAmount} SOL received!`);
        setCooldownEnd(Date.now() + AIRDROP_COOLDOWN_SEC * 1000);
        const entry: ActivityEntry = {
          type: 'Airdrop',
          amountSol: airdropAmount,
          signature: result.signature,
          status: 'confirmed',
          timestamp: Date.now(),
        };
        setActivity((prev) => {
          const next = [entry, ...prev].slice(0, MAX_ACTIVITY_ENTRIES);
          saveActivity(next);
          return next;
        });
        refreshBalances();
      } else {
        if (result.retryAfterSec) {
          setCooldownEnd(Date.now() + result.retryAfterSec * 1000);
          toast.error(`Rate limited — retry in ${result.retryAfterSec}s`);
        } else {
          toast.error(result.error || 'Airdrop failed');
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Airdrop request failed');
    } finally {
      setAirdropLoading(false);
    }
  }, [walletAddr, airdropAmount, refreshBalances]);

  // ─── Deposit handler (wallet → arb account) ────────────
  const handleDeposit = useCallback(async () => {
    if (!publicKey || !signTransaction || depositNum <= 0) return;
    setDepositLoading(true);
    try {
      const lamports = Math.round(depositNum * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY),
          lamports,
        }),
      );
      tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const serialized = signed.serialize().toString('base64');

      const result: TransferResult = await submitTransfer({
        fromWallet: walletAddr,
        toWallet: TREASURY,
        amountSol: depositNum,
        signedTx: serialized,
      });

      if (result.success && result.signature) {
        toast.success(`Deposited ${depositNum} SOL to arb account`);
        const entry: ActivityEntry = {
          type: 'Deposit',
          amountSol: depositNum,
          signature: result.signature,
          status: 'confirmed',
          timestamp: Date.now(),
        };
        setActivity((prev) => {
          const next = [entry, ...prev].slice(0, MAX_ACTIVITY_ENTRIES);
          saveActivity(next);
          return next;
        });
        setDepositAmount('');
        refreshBalances();
      } else {
        toast.error(result.error || 'Deposit failed');
        const entry: ActivityEntry = {
          type: 'Deposit',
          amountSol: depositNum,
          signature: '',
          status: 'failed',
          timestamp: Date.now(),
        };
        setActivity((prev) => {
          const next = [entry, ...prev].slice(0, MAX_ACTIVITY_ENTRIES);
          saveActivity(next);
          return next;
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setDepositLoading(false);
    }
  }, [publicKey, signTransaction, connection, depositNum, walletAddr, TREASURY, refreshBalances]);

  // ─── Copy to clipboard ─────────────────────────────────
  const copyAddress = useCallback((addr: string) => {
    navigator.clipboard.writeText(addr).then(() => toast.success('Address copied'));
  }, []);

  // ─── Not connected ─────────────────────────────────────
  if (!connected || !publicKey) {
    return (
      <div className="glass-card p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
        <h3 className="text-lg font-bold text-white mb-1">Connect Wallet</h3>
        <p className="text-dark-400 text-sm">Connect your Solana wallet to use devnet funding.</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">Devnet Funding</h2>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-orange-600/30 text-orange-300 uppercase tracking-wide">
              Devnet
            </span>
          </div>
          <p className="text-xs text-dark-500 mt-0.5">
            Test environment — funds have no real value
          </p>
        </div>
        <button
          type="button"
          onClick={refreshBalances}
          disabled={loading}
          className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition disabled:opacity-40"
          title="Refresh balances"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Dual balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Your Wallet */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-dark-400 uppercase tracking-wide">Your Wallet</h3>
            <button
              type="button"
              onClick={() => copyAddress(walletAddr)}
              className="text-dark-500 hover:text-white transition"
              title="Copy address"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[11px] text-dark-500 font-mono mb-3">{truncateAddress(walletAddr, 6)}</p>
          {balances ? (
            <>
              <p className="text-2xl font-bold text-white">{userSol.toFixed(4)} <span className="text-sm text-dark-400">SOL</span></p>
              {balances.userWallet.usdcBalance > 0 && (
                <p className="text-xs text-dark-400 mt-0.5">{balances.userWallet.usdcBalance.toFixed(2)} USDC</p>
              )}
            </>
          ) : (
            <div className="space-y-2 animate-pulse">
              <div className="h-8 bg-dark-700 rounded w-32" />
              <div className="h-3 bg-dark-800 rounded w-20" />
            </div>
          )}
          {lastRefresh > 0 && (
            <p className="text-[10px] text-dark-600 mt-2">Updated {relativeTime(lastRefresh)}</p>
          )}
        </div>

        {/* Arb Account */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-dark-400 uppercase tracking-wide">Arb Account</h3>
            <button
              type="button"
              onClick={() => copyAddress(TREASURY)}
              className="text-dark-500 hover:text-white transition"
              title="Copy address"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[11px] text-dark-500 font-mono mb-3">{truncateAddress(TREASURY, 6)}</p>
          {balances ? (
            <>
              <p className="text-2xl font-bold text-cyan-300">{arbSol.toFixed(4)} <span className="text-sm text-dark-400">SOL</span></p>
              {balances.arbAccount.usdcBalance > 0 && (
                <p className="text-xs text-dark-400 mt-0.5">{balances.arbAccount.usdcBalance.toFixed(2)} USDC</p>
              )}
            </>
          ) : (
            <div className="space-y-2 animate-pulse">
              <div className="h-8 bg-dark-700 rounded w-32" />
              <div className="h-3 bg-dark-800 rounded w-20" />
            </div>
          )}
          <p className="text-[10px] text-dark-600 mt-2">This account executes trades</p>
        </div>
      </div>

      {/* Action tabs */}
      <div className="glass-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-dark-700">
          {(['airdrop', 'deposit', 'withdraw'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition ${
                activeTab === tab
                  ? 'text-white border-b-2 border-cyan-400 bg-dark-800/50'
                  : 'text-dark-500 hover:text-dark-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Airdrop tab */}
          {activeTab === 'airdrop' && (
            <div className="space-y-4">
              <p className="text-sm text-dark-400">Request SOL from the devnet faucet</p>

              <div className="flex gap-2">
                {AIRDROP_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAirdropAmount(amt)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                      airdropAmount === amt
                        ? 'bg-cyan-600/30 text-cyan-300 ring-1 ring-cyan-500/50'
                        : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                    }`}
                  >
                    {amt} SOL
                  </button>
                ))}
              </div>

              <div className="text-xs text-dark-500">
                Target: <span className="text-dark-300">{truncateAddress(walletAddr, 6)}</span> (Your Wallet)
              </div>

              <button
                type="button"
                onClick={handleAirdrop}
                disabled={airdropLoading || cooldownLeft > 0}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {airdropLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Requesting…</>
                ) : cooldownLeft > 0 ? (
                  `Wait ${cooldownLeft}s`
                ) : (
                  <>
                    Request Airdrop
                    <span className="px-1.5 py-0.5 text-[9px] rounded bg-orange-600/40 text-orange-300">DEVNET</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Deposit tab */}
          {activeTab === 'deposit' && (
            <div className="space-y-4">
              <p className="text-sm text-dark-400">Transfer SOL from your wallet to the arb account</p>

              <div>
                <div className="flex items-center justify-between text-xs text-dark-500 mb-1">
                  <span>Amount (SOL)</span>
                  <span>Available: {userSol.toFixed(4)} SOL</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    max={maxDeposit}
                    step={0.01}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setDepositAmount(maxDeposit.toFixed(4))}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-dark-700 text-dark-300 hover:bg-dark-600 transition"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {depositNum > 0 && (
                <div className="text-xs text-dark-500">
                  Remaining after deposit: ~{Math.max(0, userSol - depositNum).toFixed(4)} SOL
                </div>
              )}

              {depositWarning && (
                <div className="flex items-start gap-2 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{depositWarning}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleDeposit}
                disabled={depositDisabled}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {depositLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Signing & Sending…</>
                ) : (
                  <>
                    Deposit to Arb Account
                    <span className="px-1.5 py-0.5 text-[9px] rounded bg-orange-600/40 text-orange-300">DEVNET</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Withdraw tab */}
          {activeTab === 'withdraw' && (
            <div className="space-y-4">
              <p className="text-sm text-dark-400">Withdraw SOL from arb account back to your wallet</p>

              <div className="rounded-lg border border-dark-600 bg-dark-800/50 p-4 text-center">
                <p className="text-sm text-dark-300 mb-2">
                  Withdrawal requires admin key — the arb account is controlled by the bot.
                </p>
                <p className="text-xs text-dark-500">
                  Use the Bot control panel or contact admin to withdraw funds.
                </p>
              </div>

              <div className="text-xs text-dark-500">
                Arb account balance: <span className="text-cyan-300 font-semibold">{arbSol.toFixed(4)} SOL</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      {activity.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-xs font-medium text-dark-400 uppercase tracking-wide mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {activity.slice(0, 5).map((entry, i) => (
              <div
                key={`${entry.timestamp}-${i}`}
                className="flex items-center justify-between text-xs py-1.5 border-b border-dark-800 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      entry.type === 'Airdrop'
                        ? 'bg-cyan-600/20 text-cyan-300'
                        : entry.type === 'Deposit'
                          ? 'bg-green-600/20 text-green-300'
                          : 'bg-purple-600/20 text-purple-300'
                    }`}
                  >
                    {entry.type}
                  </span>
                  <span className="text-dark-300">{entry.amountSol} SOL</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] ${entry.status === 'confirmed' ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {entry.status}
                  </span>
                  {entry.signature && (
                    <a
                      href={explorerLink(entry.signature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dark-500 hover:text-cyan-400 transition"
                      title="View on Solana Explorer"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <span className="text-dark-600">{relativeTime(entry.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
