
'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import {
  Settings,
  Save,
  Bell,
  Shield,
  Zap,
  Wallet,
  Key,
  Sliders,
  Search,
} from 'lucide-react';
import { HelpTooltip } from '@/components/HelpTooltip';
import toast from 'react-hot-toast';

type TabId = 'trading' | 'wallet' | 'notifications' | 'api' | 'advanced';

interface SettingsState {
  // Trading
  minProfit: number;
  maxGas: number;
  slippage: number;
  riskLevel: string;
  autoTrade: boolean;
  // Wallet
  preferredChains: string[];
  txConfirmations: number;
  // Notifications
  notifications: boolean;
  emailAlerts: boolean;
  discordAlerts: boolean;
  // API
  rpcUrl: string;
  privateRelay: string;
  wcProjectId: string;
  // Advanced
  mevProtection: boolean;
  flashloanMax: number;
}

const TABS: { id: TabId; label: string; icon: typeof Zap }[] = [
  { id: 'trading', label: 'Trading', icon: Zap },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api', label: 'API', icon: Key },
  { id: 'advanced', label: 'Advanced', icon: Sliders },
];

const DEFAULT_SETTINGS: SettingsState = {
  minProfit: 0.01,
  maxGas: 50,
  slippage: 0.5,
  riskLevel: 'medium',
  autoTrade: false,
  preferredChains: ['Ethereum', 'Arbitrum'],
  txConfirmations: 1,
  notifications: true,
  emailAlerts: false,
  discordAlerts: false,
  rpcUrl: '',
  privateRelay: '',
  wcProjectId: '',
  mevProtection: true,
  flashloanMax: 10,
};

function FieldRow({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
      <div className="flex items-center gap-2 mb-2">
        <label className="text-sm font-medium text-white">{label}</label>
        <HelpTooltip content={help} />
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('trading');
  const [settings, setSettings] = useState<SettingsState>(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = sessionStorage.getItem('arbimind-settings');
        if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
      } catch {}
    }
    return DEFAULT_SETTINGS;
  });
  const [search, setSearch] = useState('');

  const handleChange = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    try {
      sessionStorage.setItem('arbimind-settings', JSON.stringify(settings));
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  return (
    <DashboardLayout currentPath="/settings">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 sm:p-6 lg:p-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Settings
              </h1>
              <p className="text-dark-300 text-sm sm:text-base">
                Configure trading, wallet, notifications, and API preferences.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                <input
                  id="settings-search"
                  name="settingsSearch"
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                  className="pl-9 pr-4 py-2 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm w-full sm:w-48 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:opacity-90 transition"
              >
                <Save className="w-4 h-4" />
                Save Settings
              </button>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="glass-card p-2 sm:p-4"
        >
          <div className="flex flex-wrap gap-1 border-b border-dark-600 pb-2 mb-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Trading */}
          {activeTab === 'trading' && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-bold text-white">Trading</h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FieldRow
                  label="Min Profit (ETH)"
                  help="Best: 0.01 ETH. Min profit to execute. Higher = fewer but safer trades."
                >
                  <input
                    id="min-profit"
                    name="minProfit"
                    type="range"
                    min="0.001"
                    max="0.1"
                    step="0.001"
                    value={settings.minProfit}
                    onChange={(e) => handleChange('minProfit', parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none bg-dark-700 accent-cyan-500"
                  />
                  <span className="text-sm text-dark-400 mt-1 block">{settings.minProfit} ETH</span>
                </FieldRow>
                <FieldRow
                  label="Max Gas (Gwei)"
                  help="Best: 50 Gwei mainnet. Gas cap. 100 = more aggressive."
                >
                  <input
                    id="max-gas"
                    name="maxGas"
                    type="range"
                    min="10"
                    max="150"
                    step="1"
                    value={settings.maxGas}
                    onChange={(e) => handleChange('maxGas', parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none bg-dark-700 accent-cyan-500"
                  />
                  <span className="text-sm text-dark-400 mt-1 block">{settings.maxGas} Gwei</span>
                </FieldRow>
                <FieldRow
                  label="Slippage (%)"
                  help="Best: 0.5%. Max acceptable price movement. Higher = more failed txs."
                >
                  <input
                    id="slippage"
                    name="slippage"
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.1"
                    value={settings.slippage}
                    onChange={(e) => handleChange('slippage', parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none bg-dark-700 accent-cyan-500"
                  />
                  <span className="text-sm text-dark-400 mt-1 block">{settings.slippage}%</span>
                </FieldRow>
                <FieldRow
                  label="Risk Level"
                  help="Low: conservative. Medium: balanced. High: aggressive opps."
                >
                  <select
                    id="risk-level"
                    name="riskLevel"
                    value={settings.riskLevel}
                    onChange={(e) => handleChange('riskLevel', e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                  >
                    <option value="low">Low – Conservative</option>
                    <option value="medium">Medium – Balanced</option>
                    <option value="high">High – Aggressive</option>
                  </select>
                </FieldRow>
                <div className="lg:col-span-2 flex items-center justify-between p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-white">Auto Trade</label>
                    <HelpTooltip content="Execute profitable opps automatically when conditions match." />
                  </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="auto-trade"
                      name="autoTrade"
                      type="checkbox"
                      checked={settings.autoTrade}
                      onChange={(e) => handleChange('autoTrade', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-dark-700 rounded-full peer-focus:ring-2 peer-focus:ring-cyan-500 peer peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                </div>
              </div>
            </motion.div>
          )}

          {/* Wallet */}
          {activeTab === 'wallet' && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-bold text-white">Wallet</h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FieldRow
                  label="Preferred Chains"
                  help="Networks to scan for arb. Add more for cross-chain."
                >
                  <div className="flex flex-wrap gap-3">
                    {['Ethereum', 'Arbitrum', 'Base', 'Optimism'].map((chain) => {
                      const checked = settings.preferredChains.includes(chain);
                      return (
                        <label key={chain} className="flex items-center gap-2 cursor-pointer">
                          <input
                            id={`chain-${chain.toLowerCase()}`}
                            name={`chain-${chain}`}
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? settings.preferredChains.filter((c) => c !== chain)
                                : [...settings.preferredChains, chain];
                              handleChange('preferredChains', next.length ? next : [chain]);
                            }}
                            className="rounded border-dark-600 bg-dark-800 text-cyan-500 focus:ring-cyan-500"
                          />
                          <span className="text-sm text-white">{chain}</span>
                        </label>
                      );
                    })}
                  </div>
                </FieldRow>
                <FieldRow
                  label="Tx Confirmations"
                  help="Blocks to wait before considering tx final. 1 = fast, 2+ = safer."
                >
                  <input
                    id="tx-confirmations"
                    name="txConfirmations"
                    type="number"
                    min="1"
                    max="12"
                    value={settings.txConfirmations}
                    onChange={(e) => handleChange('txConfirmations', parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </FieldRow>
              </div>
            </motion.div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-green-400" />
                <h2 className="text-lg font-bold text-white">Notifications</h2>
              </div>
              <div className="space-y-4">
                {[
                  { key: 'notifications' as const, label: 'Browser Notifications', help: 'Toast alerts for trades.' },
                  { key: 'emailAlerts' as const, label: 'Email Alerts', help: 'Email on profits or errors.' },
                  { key: 'discordAlerts' as const, label: 'Discord Alerts', help: 'Webhook to Discord channel.' },
                ].map(({ key, label, help }) => (
                  <div key={key} className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-white">{label}</label>
                      <HelpTooltip content={help} />
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        id={`notif-${key}`}
                        name={key}
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(e) => handleChange(key, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-700 rounded-full peer peer-checked:bg-cyan-500 after:transition-all after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 peer-checked:after:translate-x-5" />
                    </label>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* API */}
          {activeTab === 'api' && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-white">API</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <FieldRow
                  label="RPC URL"
                  help="Custom RPC endpoint. Leave empty to use default."
                >
                  <input
                    id="rpc-url"
                    name="rpcUrl"
                    type="url"
                    placeholder="https://eth-mainnet.g.alchemy.com/v2/..."
                    value={settings.rpcUrl}
                    onChange={(e) => handleChange('rpcUrl', e.target.value)}
                    autoComplete="off"
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </FieldRow>
                <FieldRow
                  label="Private Relay"
                  help="MEV relay URL for private tx submission."
                >
                  <input
                    id="private-relay"
                    name="privateRelay"
                    type="url"
                    placeholder="https://..."
                    value={settings.privateRelay}
                    onChange={(e) => handleChange('privateRelay', e.target.value)}
                    autoComplete="off"
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </FieldRow>
                <FieldRow
                  label="WalletConnect Project ID"
                  help="From cloud.walletconnect.com. For mobile wallet connect."
                >
                  <input
                    id="wc-project-id"
                    name="wcProjectId"
                    type="text"
                    placeholder="Project ID"
                    value={settings.wcProjectId}
                    onChange={(e) => handleChange('wcProjectId', e.target.value)}
                    autoComplete="off"
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </FieldRow>
              </div>
            </motion.div>
          )}

          {/* Advanced */}
          {activeTab === 'advanced' && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <Sliders className="w-5 h-5 text-orange-400" />
                <h2 className="text-lg font-bold text-white">Advanced</h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-white">MEV Protection</label>
                    <HelpTooltip content="Use private relay to reduce frontrunning. Recommended on." />
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="mev-protection"
                      name="mevProtection"
                      type="checkbox"
                      checked={settings.mevProtection}
                      onChange={(e) => handleChange('mevProtection', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-dark-700 rounded-full peer-focus:ring-2 peer-focus:ring-cyan-500 peer peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                </div>
                <FieldRow
                  label="Flashloan Max (ETH)"
                  help="Max flashloan size. Higher = bigger arb but more gas."
                >
                  <input
                    id="flashloan-max"
                    name="flashloanMax"
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={settings.flashloanMax}
                    onChange={(e) => handleChange('flashloanMax', parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none bg-dark-700 accent-cyan-500"
                  />
                  <span className="text-sm text-dark-400 mt-1 block">{settings.flashloanMax} ETH</span>
                </FieldRow>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
