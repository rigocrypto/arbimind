'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import {
  AlertCircle,
  Bell,
  Database,
  Save,
  Settings as SettingsIcon,
  Shield,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Settings } from '@/lib/settings';
import { useSettingsStore } from '@/stores/settingsStore';
import { useHydrateSettings } from '@/stores/useHydrateSettings';

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
  const setSetting = useSettingsStore((state) => state.setSetting);
  const save = useSettingsStore((state) => state.save);
  const resetToDefaults = useSettingsStore((state) => state.resetToDefaults);

  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleSave = async () => {
    const ok = await save();
    if (!ok) return;
    setJustSaved(true);
    toast.success('Settings saved');
    window.setTimeout(() => setJustSaved(false), 2500);
  };

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
                  Configure trading preferences, safety guardrails, and notifications for the arbitrage engine.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={resetToDefaults}
                className="rounded-lg border border-dark-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-dark-700/80"
              >
                Reset Defaults
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || isLoading}
                className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                <span>{isLoading ? 'Saving...' : justSaved ? 'Saved!' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-2">
            <Zap className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">Trading Preferences</h2>
          </div>
          <div className="space-y-4">
            <ToggleRow
              id="auto-trade"
              label="Enable Auto-Trading"
              description="Automatically execute validated opportunities once checks pass."
              value={settings.autoTrade}
              onToggle={(checked) => toggleBoolean('autoTrade')(checked)}
            />

            <NumberInput
              id="min-profit"
              label="Minimum Profit Threshold (ETH)"
              description="Minimum profit required before triggering execution."
              value={settings.minProfit}
              step={0.001}
              min={0}
              onChange={(value) => handleNumberChange('minProfit', 0.01)(value)}
            />

            <NumberInput
              id="max-gas"
              label="Maximum Gas Price (Gwei)"
              description="Upper limit you are willing to pay per trade."
              value={settings.maxGas}
              step={1}
              min={1}
              onChange={(value) => handleNumberChange('maxGas', 50)(value)}
            />

            <NumberInput
              id="slippage"
              label="Slippage Tolerance (%)"
              description="Acceptable price impact before aborting a swap."
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
              <p className="mt-1 text-xs text-dark-400">Adjusts scanner breadth, holding duration, and hedging appetite.</p>
            </div>

            <div className="rounded-lg border border-dark-700 bg-dark-800/50 p-4">
              <span className="text-sm font-medium text-white">Preferred Execution Chains</span>
              <p className="mt-1 text-xs text-dark-400">Select the networks prioritized during opportunity scanning.</p>
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
          </div>
          <div className="space-y-4">
            <NumberInput
              id="tx-confirmations"
              label="Required Confirmations"
              description="Blocks to wait before treating a trade as finalized."
              value={settings.txConfirmations}
              step={1}
              min={1}
              onChange={(value) => handleNumberChange('txConfirmations', 1)(value)}
            />
            <NumberInput
              id="flashloan-max"
              label="Flashloan Notional Cap (ETH)"
              description="Maximum flashloan size permitted for composite routes."
              value={settings.flashloanMax}
              step={1}
              min={1}
              onChange={(value) => handleNumberChange('flashloanMax', 10)(value)}
            />
            <ToggleRow
              id="mev-protection"
              label="MEV Protection"
              description="Route critical swaps through private relays when available."
              value={settings.mevProtection}
              onToggle={(checked) => toggleBoolean('mevProtection')(checked)}
            />
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-2">
            <Bell className="h-5 w-5 text-green-400" />
            <h2 className="text-lg font-bold text-white">Notifications</h2>
          </div>
          <div className="space-y-4">
            <ToggleRow
              id="notifications"
              label="Enable Browser Notifications"
              description="Push trade outcomes and alerts directly to your device."
              value={settings.notifications}
              onToggle={(checked) => toggleBoolean('notifications')(checked)}
            />
            <ToggleRow
              id="email-alerts"
              label="Email Alerts"
              description="Send daily summaries and urgent notices via email."
              value={settings.emailAlerts}
              onToggle={(checked) => toggleBoolean('emailAlerts')(checked)}
            />
            <ToggleRow
              id="discord-alerts"
              label="Discord Webhook Alerts"
              description="Post execution updates to connected Discord channels."
              value={settings.discordAlerts}
              onToggle={(checked) => toggleBoolean('discordAlerts')(checked)}
            />
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-2">
            <Database className="h-5 w-5 text-orange-400" />
            <h2 className="text-lg font-bold text-white">Connectivity</h2>
          </div>
          <div className="space-y-4">
            <TextInput
              id="rpc-url"
              label="Primary RPC URL"
              placeholder="https://arb1.infura.io/v3/..."
              description="RPC endpoint used for opportunity scanning and execution."
              value={settings.rpcUrl}
              onChange={(value) => setSetting('rpcUrl', value)}
            />
            <TextInput
              id="private-relay"
              label="Private Relay URL"
              placeholder="https://relay.flashbots.net"
              description="Optional private relay endpoint for MEV-protected submissions."
              value={settings.privateRelay}
              onChange={(value) => setSetting('privateRelay', value)}
            />
            <TextInput
              id="wc-project"
              label="WalletConnect Project ID"
              placeholder="Project identifier for WalletConnect session pairing"
              description="Needed when generating shareable WalletConnect links."
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
            Saved settings persist locally in your browser and sync across tabs. For shared environments, mirror these values in your environment variables or configuration service to keep automation behavior predictable.
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
}: {
  id: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-dark-700 bg-dark-800/50 p-4">
      <div>
        <label className="text-sm font-medium text-white" htmlFor={id}>
          {label}
        </label>
        <p className="mt-1 text-xs text-dark-400">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={value}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="peer h-6 w-11 rounded-full bg-dark-700 transition peer-checked:bg-cyan-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500">
          <span className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-full" />
        </span>
      </label>
    </div>
  );
}
