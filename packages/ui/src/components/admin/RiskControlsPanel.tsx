'use client';

import { useState, useCallback } from 'react';
import { Shield, Save, RotateCcw, Loader2 } from 'lucide-react';
import { adminApi, type EngineSettingsResponse } from '@/lib/adminApi';
import toast from 'react-hot-toast';

interface RiskControlsPanelProps {
  settings: EngineSettingsResponse | null;
  applied: Record<string, boolean> | null;
  onSettingsUpdated: (s: EngineSettingsResponse) => void;
}

export function RiskControlsPanel({ settings, applied, onSettingsUpdated }: RiskControlsPanelProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    minProfitEth: settings?.minProfitEth ?? 0.01,
    maxGasGwei: settings?.maxGasGwei ?? 50,
    slippagePct: settings?.slippagePct ?? 0.5,
    flashloanMaxEth: settings?.flashloanMaxEth ?? 10,
    riskLevel: settings?.riskLevel ?? 'medium',
    mevProtection: settings?.mevProtection ?? true,
  });

  const handleEdit = () => {
    setDraft({
      minProfitEth: settings?.minProfitEth ?? 0.01,
      maxGasGwei: settings?.maxGasGwei ?? 50,
      slippagePct: settings?.slippagePct ?? 0.5,
      flashloanMaxEth: settings?.flashloanMaxEth ?? 10,
      riskLevel: settings?.riskLevel ?? 'medium',
      mevProtection: settings?.mevProtection ?? true,
    });
    setEditing(true);
  };

  const handleSave = useCallback(async () => {
    if (!window.confirm('Save these risk control settings? Changes take effect immediately.')) return;
    setSaving(true);
    const res = await adminApi.updateSettings(draft);
    setSaving(false);
    if (res.ok && res.data?.settings) {
      onSettingsUpdated(res.data.settings);
      toast.success('Settings saved');
      setEditing(false);
    } else {
      toast.error(res.error ?? 'Failed to save settings');
    }
  }, [draft, onSettingsUpdated]);

  const rows = [
    {
      key: 'minProfitEth',
      label: 'Min Profit Threshold',
      unit: 'ETH',
      value: settings?.minProfitEth,
      draftValue: draft.minProfitEth,
      onChange: (v: string) => setDraft((d) => ({ ...d, minProfitEth: Number(v) || 0 })),
      type: 'number' as const,
      step: '0.001',
    },
    {
      key: 'maxGasGwei',
      label: 'Max Gas Per Tx',
      unit: 'gwei',
      value: settings?.maxGasGwei,
      draftValue: draft.maxGasGwei,
      onChange: (v: string) => setDraft((d) => ({ ...d, maxGasGwei: Number(v) || 0 })),
      type: 'number' as const,
      step: '1',
    },
    {
      key: 'slippagePct',
      label: 'Slippage Threshold',
      unit: '%',
      value: settings?.slippagePct,
      draftValue: draft.slippagePct,
      onChange: (v: string) => setDraft((d) => ({ ...d, slippagePct: Number(v) || 0 })),
      type: 'number' as const,
      step: '0.1',
    },
    {
      key: 'flashloanMaxEth',
      label: 'Max Trade Size',
      unit: 'ETH',
      value: settings?.flashloanMaxEth,
      draftValue: draft.flashloanMaxEth,
      onChange: (v: string) => setDraft((d) => ({ ...d, flashloanMaxEth: Number(v) || 0 })),
      type: 'number' as const,
      step: '0.5',
    },
  ];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          Risk Controls
        </h3>
        {!editing ? (
          <button onClick={handleEdit} className="btn text-sm">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="btn text-sm flex items-center gap-1"
              disabled={saving}
            >
              <RotateCcw className="w-3 h-3" /> Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn btn-success text-sm flex items-center gap-1"
              disabled={saving}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between">
            <div>
              <span className="text-sm text-dark-300">{row.label}</span>
              {applied && applied[row.key] === false && (
                <span className="ml-2 text-xs text-amber-400/70">(saved — not yet wired)</span>
              )}
            </div>
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type={row.type}
                  step={row.step}
                  value={row.draftValue}
                  onChange={(e) => row.onChange(e.target.value)}
                  className="input-field w-24 text-right text-sm"
                />
                <span className="text-xs text-dark-500 w-10">{row.unit}</span>
              </div>
            ) : (
              <span className="text-sm font-medium text-white">
                {row.value != null ? `${row.value} ${row.unit}` : '—'}
              </span>
            )}
          </div>
        ))}

        {/* Risk Level */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-dark-300">Risk Level</span>
          {editing ? (
            <select
              value={draft.riskLevel}
              onChange={(e) => setDraft((d) => ({ ...d, riskLevel: e.target.value as 'low' | 'medium' | 'high' }))}
              className="input-field w-24 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          ) : (
            <span className={`text-sm font-medium capitalize ${
              settings?.riskLevel === 'high' ? 'text-red-400' :
              settings?.riskLevel === 'low' ? 'text-green-400' : 'text-amber-400'
            }`}>
              {settings?.riskLevel ?? '—'}
            </span>
          )}
        </div>

        {/* MEV Protection */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-dark-300">MEV Protection</span>
          {editing ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.mevProtection}
                onChange={(e) => setDraft((d) => ({ ...d, mevProtection: e.target.checked }))}
                className="rounded border-dark-600 bg-dark-700 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-xs text-dark-400">{draft.mevProtection ? 'On' : 'Off'}</span>
            </label>
          ) : (
            <span className={`text-sm font-medium ${settings?.mevProtection ? 'text-green-400' : 'text-red-400'}`}>
              {settings?.mevProtection ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
