'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import {
  AlertCircle,
  Bell,
  Database,
  Info,
  Save,
  Settings as SettingsIcon,
  Shield,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Settings } from '@/lib/settings';
import { useSettingsStore, type AppliedMeta } from '@/stores/settingsStore';
import { useHydrateSettings } from '@/stores/useHydrateSettings';
import { hasAdminKey } from '@/lib/adminApi';

const CHAIN_OPTIONS = ['Ethereum', 'Arbitrum', 'Optimism', 'Base', 'Polygon'];

type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

type NumberSettingKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

export default function SettingsPageClient() {
  useHydrateSettings();

  const settings = useSettingsStore((state) => state.settings);
  const isDirty = useSettingsStore((state) => state.isDirty);
  const isLoading = useSettingsStore((state) => state.isLoading);
  const error = useSettingsStore((state) => state.error);
  const validationErrors = useSettingsStore((state) => state.validationErrors);
  const source = useSettingsStore((state) => state.source);
  const applied = useSettingsStore((state) => state.applied);
  const setSetting = useSettingsStore((state) => state.setSetting);
  const save = useSettingsStore((state) => state.save);
  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults);

  const [justSaved, setJustSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleSave = async () => {
    const ok = await save();
    if (!ok) {
      toast.error('Fix validation errors before saving');
      return;
    }
    setJustSaved(true);
    toast.success('Settings saved');
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  const handleResetDefaults = useCallback(async () => {
    if (!showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }
    await resetToDefaults();
    setShowResetConfirm(false);
    toast.success('Defaults restored');
  }, [showResetConfirm, resetToDefaults]);

  const toggleBoolean = (key: BooleanSettingKey) => (value: boolean) => {
    setSetting(key, value);
  };

  const handleNumberChange = (key: NumberSettingKey, fallback: number) => (raw: string) => {
    const parsed = Number.parseFloat(raw);
    setSetting(key, Number.isFinite(parsed) ? parsed : fallback);
  };

  const chainSelections = useMemo(
    () => new Set(settings.preferredChains),
    [settings.preferredChains],
  );

  const toggleChain = (chain: string) => {
    const next = new Set(chainSelections);
    if (next.has(chain)) {
      next.delete(chain);
    } else {
      next.add(chain);
    }
    setSetting('preferredChains', Array.from(next));
  };

  return (
    <DashboardLayout currentPath="/settings">
      <div className="space-y-4 sm:space-y-6">
        <div className="glass-card p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-cyan-500/10 p-2">
                <SettingsIcon className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl lg:text-4xl">
                  Settings
                </h1>
                <p className="text-sm text-dark-300 sm:text-base">
                  {source === 'backend'
                    ? 'Settings synced with the backend. Changes are persisted server-side.'
                    : source === 'local-cache'
                      ? 'Loaded from browser cache — backend sync pending.'
                      : 'Using defaults — backend not yet connected.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {showResetConfirm ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="rounded-lg border border-red-500/60 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="rounded-lg border border-dark-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-dark-700/80"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="rounded-lg border border-dark-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-dark-700/80"
                >
                  Reset Defaults
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || isLoading || validationErrors.length > 0}
                className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                <span>{isLoading ? 'Saving...' : justSaved ? 'Saved!' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        </div>

        {validationErrors.length > 0 && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
            <p className="mb-1 text-sm font-semibold text-red-400">Validation errors — fix before saving</p>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-red-300">
              {validationErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="glass-card p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-2">
            <Zap className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">Trading Preferences</h2>
            <StatusBadge active={applied.engine} source={source} />
          </div>
          <div className="space-y-4">
            <ToggleRow
              id="auto-trade"
              label="Enable Auto-Trading"
              description={applied.engine ? 'Controls live auto-execution on the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.autoTrade}
              onToggle={(checked) => toggleBoolean('autoTrade')(checked)}
            />

            <NumberInput
              id="min-profit"
              label="Minimum Profit Threshold (ETH)"
              description={applied.engine ? 'Active minimum profit threshold enforced by the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.minProfit}
              step={0.001}
              min={0}
              onChange={(value) => handleNumberChange('minProfit', 0.01)(value)}
            />

            <NumberInput
              id="max-gas"
              label="Maximum Gas Price (Gwei)"
              description={applied.engine ? 'Active gas cap enforced by the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.maxGas}
              step={1}
              min={1}
              onChange={(value) => handleNumberChange('maxGas', 50)(value)}
            />

            <NumberInput
              id="slippage"
              label="Slippage Tolerance (%)"
              description={applied.engine ? 'Active slippage tolerance enforced by the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.slippage}
              step={0.05}
              min={0.05}
              onChange={(value) => handleNumberChange('slippage', 0.5)(value)}
            />

            <div className="rounded-lg border border-dark-700 bg-dark-800/50 p-4">
              <label className="text-sm font-medium text-white" htmlFor="risk-level">
                Risk Level
              </label>
              <select
                id="risk-level"
                value={settings.riskLevel}
                onChange={(e) => setSetting('riskLevel', e.target.value as Settings['riskLevel'])}
                className="mt-2 w-full rounded-lg border border-dark-600 bg-dark-900 px-4 py-2 text-white focus:border-cyan-500 focus:outline-none transition"
              >
                <option value="low">Low - Conservative</option>
                <option value="medium">Medium - Balanced</option>
                <option value="high">High - Aggressive</option>
              </select>
              <p className="mt-1 text-xs text-dark-400">{applied.engine ? 'Active risk posture enforced by the engine.' : 'Saved — will apply once engine integration is connected.'}</p>
            </div>

            <div className="rounded-lg border border-dark-700 bg-dark-800/50 p-4">
              <span className="text-sm font-medium text-white">Preferred Execution Chains</span>
              <p className="mt-1 text-xs text-dark-400">{applied.scanner ? 'Active scanner chains enforced by the engine.' : 'Saved — will apply once scanner integration is connected.'}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CHAIN_OPTIONS.map((chain) => {
                  const checked = chainSelections.has(chain);
                  return (
                    <label key={chain} className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-900/70 px-3 py-2 text-sm text-white">
                      <input
                        type="checkbox"
                        className="h-4 w-4 border-dark-600 bg-dark-800"
                        checked={checked}
                        onChange={() => toggleChain(chain)}
                      />
                      <span>{chain}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white">Risk Controls & Limits</h2>
            <StatusBadge active={applied.engine} source={source} />
          </div>
          <div className="space-y-4">
            <NumberInput
              id="tx-confirmations"
              label="Required Confirmations"
              description={applied.engine ? 'Active confirmation depth enforced by the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.txConfirmations}
              step={1}
              min={1}
              onChange={(value) => handleNumberChange('txConfirmations', 1)(value)}
            />
            <NumberInput
              id="flashloan-max"
              label="Flashloan Notional Cap (ETH)"
              description={applied.engine ? 'Active flashloan cap enforced by the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.flashloanMax}
              step={1}
              min={1}
              onChange={(value) => handleNumberChange('flashloanMax', 10)(value)}
            />
            <ToggleRow
              id="mev-protection"
              label="MEV Protection"
              description={applied.engine ? 'Active MEV protection routing on the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.mevProtection}
              onToggle={(checked) => toggleBoolean('mevProtection')(checked)}
            />
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-2">
            <Bell className="h-5 w-5 text-green-400" />
            <h2 className="text-lg font-bold text-white">Notifications</h2>
            <StatusBadge active={applied.notifications} source={source} />
          </div>
          <div className="space-y-4">
            <ToggleRow
              id="notifications"
              label="Enable Browser Notifications"
              description={applied.notifications ? 'Browser notifications are active.' : 'Saved — browser notification delivery is not yet wired.'}
              value={settings.notifications}
              onToggle={(checked) => toggleBoolean('notifications')(checked)}
            />
            <ToggleRow
              id="email-alerts"
              label="Email Alerts"
              description="Coming soon — no email backend is connected yet."
              value={settings.emailAlerts}
              onToggle={(checked) => toggleBoolean('emailAlerts')(checked)}
              disabled
            />
            <ToggleRow
              id="discord-alerts"
              label="Discord Webhook Alerts"
              description="Coming soon — no Discord webhook integration exists yet."
              value={settings.discordAlerts}
              onToggle={(checked) => toggleBoolean('discordAlerts')(checked)}
              disabled
            />
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-2">
            <Database className="h-5 w-5 text-orange-400" />
            <h2 className="text-lg font-bold text-white">Connectivity</h2>
            <StatusBadge active={applied.engine} source={source} />
          </div>
          <div className="space-y-4">
            <TextInput
              id="rpc-url"
              label="Primary RPC URL"
              placeholder="https://arb1.infura.io/v3/..."
              description={applied.engine ? 'Active RPC endpoint used by the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.rpcUrl}
              onChange={(value) => setSetting('rpcUrl', value)}
            />
            <TextInput
              id="private-relay"
              label="Private Relay URL"
              placeholder="https://relay.flashbots.net"
              description={applied.engine ? 'Active relay endpoint used by the engine.' : 'Saved — will apply once engine integration is connected.'}
              value={settings.privateRelay}
              onChange={(value) => setSetting('privateRelay', value)}
            />
            <TextInput
              id="wc-project"
              label="WalletConnect Project ID"
              placeholder="Project identifier for WalletConnect session pairing"
              description={applied.walletconnect ? 'Active WalletConnect project ID.' : 'Saved — WalletConnect pairing is not yet connected.'}
              value={settings.wcProjectId}
              onChange={(value) => setSetting('wcProjectId', value)}
            />
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-orange-300">
            <AlertCircle className="h-5 w-5" />
            <h2 className="text-lg font-bold text-white">Operational Notes</h2>
          </div>
          <p className="text-sm text-dark-300">
            {source === 'backend' ? (
              <>Settings are <strong className="text-white">persisted on the backend</strong> and synced across tabs. {hasAdminKey() ? 'Saves go to the backend.' : 'Log in as admin to push changes to the backend.'}</>
            ) : (
              <>Settings are cached in your browser&apos;s localStorage and sync across tabs. They will be pushed to the backend once connection is available.</>
            )}
            {' '}Fields marked <strong className="text-white">&ldquo;Active&rdquo;</strong> are enforced by the engine; others are saved for future integration.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

function NumberInput({
  id,
  label,
  description,
  value,
  step,
  min,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  step: number;
  min: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-dark-700 bg-dark-800/50 p-4">
      <label className="text-sm font-medium text-white" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-dark-600 bg-dark-900 px-4 py-2 text-white focus:border-cyan-500 focus:outline-none transition"
      />
      <p className="mt-1 text-xs text-dark-400">{description}</p>
    </div>
  );
}

function TextInput({
  id,
  label,
  placeholder,
  description,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-dark-700 bg-dark-800/50 p-4">
      <label className="text-sm font-medium text-white" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-dark-600 bg-dark-900 px-4 py-2 text-white focus:border-cyan-500 focus:outline-none transition"
      />
      <p className="mt-1 text-xs text-dark-400">{description}</p>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  value,
  onToggle,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border border-dark-700 bg-dark-800/50 p-4${disabled ? ' opacity-50' : ''}`}>
      <div>
        <label className="text-sm font-medium text-white" htmlFor={id}>
          {label}
          {disabled && <span className="ml-2 rounded bg-dark-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-dark-300">Coming soon</span>}
        </label>
        <p className="mt-1 text-xs text-dark-400">{description}</p>
      </div>
      <label className={`relative inline-flex items-center${disabled ? ' cursor-not-allowed' : ' cursor-pointer'}`} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={value}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="peer h-6 w-11 rounded-full bg-dark-700 transition peer-checked:bg-cyan-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500">
          <span className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-full" />
        </span>
      </label>
    </div>
  );
}

function StatusBadge({ active, source }: { active: boolean; source: string }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">
        <Zap className="h-3 w-3" />
        Active
      </span>
    );
  }
  if (source === 'backend') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
        <Info className="h-3 w-3" />
        Saved (not yet enforced)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-dark-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dark-300">
      <Info className="h-3 w-3" />
      Browser-local
    </span>
  );
}
