'use client';

import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { API_BASE } from '@/lib/apiConfig';
import { getAdminKey } from '@/lib/adminApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TreasuryFundPanelProps {
  treasuryAddress: string | null;
  treasuryBalance: number;
  onRefresh: () => void;
}

type TxState = 'idle' | 'building' | 'signing' | 'confirming' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiWithCluster(path: string): string {
  // Always use devnet for bot operations
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}cluster=devnet`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TreasuryFundPanel({
  treasuryAddress,
  treasuryBalance,
  onRefresh,
}: TreasuryFundPanelProps) {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();

  // Deposit state
  const [depositAmount, setDepositAmount] = useState('1');
  const [depositState, setDepositState] = useState<TxState>('idle');
  const [depositSig, setDepositSig] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('0.5');
  const [withdrawState, setWithdrawState] = useState<TxState>('idle');
  const [withdrawSig, setWithdrawSig] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Deposit: user wallet → treasury (non-custodial, user signs)
  // -------------------------------------------------------------------------
  const handleDeposit = useCallback(async () => {
    if (!publicKey || !connected || !treasuryAddress) return;
    const amount = parseFloat(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDepositError('Enter a valid amount');
      return;
    }

    setDepositState('building');
    setDepositError(null);
    setDepositSig(null);

    try {
      // Ask backend to build the unsigned transfer tx
      const res = await fetch(apiWithCluster('/solana/tx/transfer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPubkey: publicKey.toBase58(),
          destination: 'arb',
          amountSol: amount,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((errData as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { transactionBase64: string };
      const txBytes = Uint8Array.from(atob(data.transactionBase64), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);

      // Sign + send via wallet adapter
      setDepositState('signing');
      const sig = await sendTransaction(tx, connection, {
        preflightCommitment: 'confirmed',
      });
      setDepositSig(sig);
      setDepositState('confirming');

      // Wait for confirmation
      await connection.confirmTransaction(sig, 'confirmed');
      setDepositState('success');
      onRefresh();
    } catch (err) {
      setDepositState('error');
      setDepositError(err instanceof Error ? err.message : 'Deposit failed');
    }
  }, [publicKey, connected, treasuryAddress, depositAmount, sendTransaction, connection, onRefresh]);

  // -------------------------------------------------------------------------
  // Withdraw: treasury → user wallet (custodial, treasury signs server-side)
  // -------------------------------------------------------------------------
  const handleWithdraw = useCallback(async () => {
    if (!publicKey) return;
    const amount = parseFloat(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawError('Enter a valid amount');
      return;
    }
    if (amount > treasuryBalance) {
      setWithdrawError(`Exceeds treasury balance (${treasuryBalance.toFixed(4)} SOL)`);
      return;
    }

    setWithdrawState('building');
    setWithdrawError(null);
    setWithdrawSig(null);

    try {
      const adminKey = getAdminKey();
      const res = await fetch(apiWithCluster('/solana/tx/withdraw'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminKey ? { 'X-ADMIN-KEY': adminKey } : {}),
        },
        body: JSON.stringify({
          amountSol: amount,
          toPubkey: publicKey.toBase58(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((errData as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { signature: string; explorer: string };
      setWithdrawSig(data.signature);
      setWithdrawState('confirming');

      // Wait for confirmation
      await connection.confirmTransaction(data.signature, 'confirmed');
      setWithdrawState('success');
      onRefresh();
    } catch (err) {
      setWithdrawState('error');
      setWithdrawError(err instanceof Error ? err.message : 'Withdraw failed');
    }
  }, [publicKey, withdrawAmount, treasuryBalance, connection, onRefresh]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const depositing = depositState !== 'idle' && depositState !== 'success' && depositState !== 'error';
  const withdrawing = withdrawState !== 'idle' && withdrawState !== 'success' && withdrawState !== 'error';

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-dark-100">Treasury Funding</h3>
        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-orange-600/30 text-orange-300 uppercase tracking-wider">
          DEVNET
        </span>
      </div>

      {/* Treasury info */}
      <div className="bg-dark-700/50 rounded-lg p-3 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-400">Treasury Address</span>
          {treasuryAddress ? (
            <span className="font-mono text-dark-200">
              {treasuryAddress.slice(0, 6)}...{treasuryAddress.slice(-4)}
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(treasuryAddress)}
                className="ml-1.5 text-dark-400 hover:text-dark-200 transition"
                title="Copy full address"
              >
                📋
              </button>
            </span>
          ) : (
            <span className="text-red-400">Not configured</span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-400">Treasury Balance</span>
          <span className={`font-medium ${treasuryBalance > 0.05 ? 'text-green-400' : 'text-orange-300'}`}>
            {treasuryBalance.toFixed(4)} SOL
          </span>
        </div>
        {publicKey && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-dark-400">Your Wallet</span>
            <span className="font-mono text-dark-200">
              {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
            </span>
          </div>
        )}
      </div>

      {!connected && (
        <div className="text-xs text-orange-300 bg-orange-600/10 rounded-lg px-3 py-2 border border-orange-500/20">
          Connect your Solana wallet to deposit or withdraw SOL.
        </div>
      )}

      {connected && treasuryAddress && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Deposit */}
          <div className="space-y-2">
            <label className="text-xs text-dark-400 font-medium">
              Deposit (Wallet → Treasury)
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={depositing}
                className="flex-1 bg-dark-700 border border-dark-600 rounded px-2 py-1.5 text-xs text-dark-100 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
                placeholder="SOL"
              />
              <button
                type="button"
                disabled={!connected || depositing}
                onClick={() => void handleDeposit()}
                className="px-3 py-1.5 text-xs rounded font-medium bg-green-600/20 text-green-300 hover:bg-green-600/30 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {depositing ? depositState === 'signing' ? 'Confirm in wallet...' : depositState === 'confirming' ? 'Confirming...' : 'Building...' : 'Deposit'}
              </button>
            </div>
            {depositState === 'success' && depositSig && (
              <div className="text-[10px] text-green-400">
                ✅ Deposited!{' '}
                <a
                  href={`https://solscan.io/tx/${depositSig}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-green-300"
                >
                  {depositSig.slice(0, 12)}...
                </a>
              </div>
            )}
            {depositError && (
              <div className="text-[10px] text-red-400">❌ {depositError}</div>
            )}
          </div>

          {/* Withdraw */}
          <div className="space-y-2">
            <label className="text-xs text-dark-400 font-medium">
              Withdraw (Treasury → Wallet)
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={withdrawing}
                className="flex-1 bg-dark-700 border border-dark-600 rounded px-2 py-1.5 text-xs text-dark-100 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
                placeholder="SOL"
              />
              <button
                type="button"
                disabled={!connected || withdrawing || treasuryBalance < 0.01}
                onClick={() => void handleWithdraw()}
                className="px-3 py-1.5 text-xs rounded font-medium bg-orange-600/20 text-orange-300 hover:bg-orange-600/30 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {withdrawing ? withdrawState === 'confirming' ? 'Confirming...' : 'Building...' : 'Withdraw'}
              </button>
            </div>
            {withdrawState === 'success' && withdrawSig && (
              <div className="text-[10px] text-green-400">
                ✅ Withdrawn!{' '}
                <a
                  href={`https://solscan.io/tx/${withdrawSig}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-green-300"
                >
                  {withdrawSig.slice(0, 12)}...
                </a>
              </div>
            )}
            {withdrawError && (
              <div className="text-[10px] text-red-400">❌ {withdrawError}</div>
            )}
          </div>
        </div>
      )}

      {/* Devnet airdrop hint */}
      {connected && treasuryBalance < 0.1 && (
        <div className="text-[10px] text-dark-500 bg-dark-700/30 rounded px-2 py-1.5">
          💡 Need devnet SOL? Run <code className="bg-dark-600 px-1 rounded">solana airdrop 2</code> to your wallet,
          then deposit here. Or airdrop directly to the treasury address above.
        </div>
      )}
    </div>
  );
}
