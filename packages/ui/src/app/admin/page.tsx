
'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import {
  hasAdminKey,
  setAdminKey,
  clearAdminKey,
  adminApi,
} from '@/lib/adminApi';
import { Lock, LogOut } from 'lucide-react';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [key, setKey] = useState('');
  const [loginError, setLoginError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!hasAdminKey()) {
      setChecking(false);
      return;
    }
    adminApi.getMetrics('24h').then((res) => {
      setChecking(false);
      setAuthed(res.ok);
      if (!res.ok) clearAdminKey();
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setLoginError('Please enter an admin key');
      return;
    }
    setAdminKey(trimmedKey);
    const res = await adminApi.getMetrics('24h', trimmedKey);
    if (res.ok) {
      setAuthed(true);
      setKey('');
    } else {
      clearAdminKey();
      setLoginError(res.error ?? 'Invalid admin key');
    }
  };

  const handleLogout = () => {
    clearAdminKey();
    setAuthed(false);
  };

  if (checking) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-pulse text-dark-400">Verifying admin access...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!authed) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto mt-16">
          <div className="card">
            <h1 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Lock className="w-6 h-6 text-cyan-400" />
              Admin Login
            </h1>
            <p className="text-sm text-dark-400 mb-6">
              Enter your admin API key to access the dashboard. Set <code className="text-cyan-400">ADMIN_API_KEY</code> in the backend <code className="text-cyan-400">.env</code> or Railway variables.
            </p>
            <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
              <input
                id="admin-api-key"
                type="password"
                name="admin-api-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Admin API Key"
                className="input-field w-full"
                autoComplete="off"
              />
              {loginError && <div className="text-sm text-red-400">{loginError}</div>}
              <button type="submit" className="btn-primary w-full">
                Login
              </button>
            </form>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-white">Owner / Admin Dashboard</h1>
        <div className="flex items-center gap-2">
          <a
            href="/admin/ai-dashboard"
            className="btn btn-ghost text-dark-300 hover:text-white"
          >
            AI Dashboard
          </a>
          <button
            onClick={handleLogout}
            className="btn btn-ghost flex items-center gap-2 text-dark-400 hover:text-white"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>
      <AdminDashboard />
    </DashboardLayout>
  );
}
