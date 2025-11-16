'use client';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { Settings, Save, Bell, Shield, Zap, Database, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    autoTrade: false,
    minProfitThreshold: 0.01,
    maxGasPrice: 50,
    slippageTolerance: 0.5,
    notifications: true,
    emailAlerts: false,
    riskLevel: 'medium',
    maxPositionSize: 1.0,
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // TODO: Save settings to API
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleChange = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <DashboardLayout currentPath="/settings">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="glass-card p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Settings
              </h1>
              <p className="text-dark-300 text-sm sm:text-base">
                Configure your arbitrage bot preferences, risk parameters, and notifications.
              </p>
            </div>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:opacity-90 transition"
            >
              <Save className="w-4 h-4" />
              <span>{saved ? 'Saved!' : 'Save Settings'}</span>
            </button>
          </div>
        </div>

        {/* Trading Settings */}
        <div className="glass-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">Trading Settings</h2>
          </div>

          <div className="space-y-4">
            {/* Auto Trade */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <div>
                <label className="text-sm font-medium text-white">Enable Auto Trading</label>
                <p className="text-xs text-dark-400 mt-1">Automatically execute profitable opportunities</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoTrade}
                  onChange={(e) => handleChange('autoTrade', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>

            {/* Min Profit Threshold */}
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <label className="text-sm font-medium text-white mb-2 block">
                Minimum Profit Threshold (ETH)
              </label>
              <input
                type="number"
                step="0.001"
                value={settings.minProfitThreshold}
                onChange={(e) => handleChange('minProfitThreshold', parseFloat(e.target.value))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition"
              />
              <p className="text-xs text-dark-400 mt-1">Minimum profit required to execute a trade</p>
            </div>

            {/* Max Gas Price */}
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <label className="text-sm font-medium text-white mb-2 block">
                Maximum Gas Price (Gwei)
              </label>
              <input
                type="number"
                step="1"
                value={settings.maxGasPrice}
                onChange={(e) => handleChange('maxGasPrice', parseFloat(e.target.value))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition"
              />
              <p className="text-xs text-dark-400 mt-1">Maximum gas price willing to pay per transaction</p>
            </div>

            {/* Slippage Tolerance */}
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <label className="text-sm font-medium text-white mb-2 block">
                Slippage Tolerance (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.slippageTolerance}
                onChange={(e) => handleChange('slippageTolerance', parseFloat(e.target.value))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition"
              />
              <p className="text-xs text-dark-400 mt-1">Maximum acceptable price slippage</p>
            </div>
          </div>
        </div>

        {/* Risk Management */}
        <div className="glass-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white">Risk Management</h2>
          </div>

          <div className="space-y-4">
            {/* Risk Level */}
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <label className="text-sm font-medium text-white mb-2 block">Risk Level</label>
              <select
                value={settings.riskLevel}
                onChange={(e) => handleChange('riskLevel', e.target.value)}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition"
              >
                <option value="low">Low - Conservative</option>
                <option value="medium">Medium - Balanced</option>
                <option value="high">High - Aggressive</option>
              </select>
              <p className="text-xs text-dark-400 mt-1">Overall risk tolerance for trading strategies</p>
            </div>

            {/* Max Position Size */}
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <label className="text-sm font-medium text-white mb-2 block">
                Maximum Position Size (ETH)
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.maxPositionSize}
                onChange={(e) => handleChange('maxPositionSize', parseFloat(e.target.value))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 transition"
              />
              <p className="text-xs text-dark-400 mt-1">Maximum size per trade position</p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Bell className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-bold text-white">Notifications</h2>
          </div>

          <div className="space-y-4">
            {/* Enable Notifications */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <div>
                <label className="text-sm font-medium text-white">Enable Notifications</label>
                <p className="text-xs text-dark-400 mt-1">Receive browser notifications for trades</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(e) => handleChange('notifications', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>

            {/* Email Alerts */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <div>
                <label className="text-sm font-medium text-white">Email Alerts</label>
                <p className="text-xs text-dark-400 mt-1">Receive email notifications for important events</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailAlerts}
                  onChange={(e) => handleChange('emailAlerts', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="glass-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Database className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-bold text-white">Advanced</h2>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5" />
                <div>
                  <p className="text-sm text-white font-medium">API Configuration</p>
                  <p className="text-xs text-dark-400 mt-1">
                    Advanced API settings and connection details can be configured via environment variables.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

