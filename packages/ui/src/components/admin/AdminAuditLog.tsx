'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminApi, type AdminAuditEvent } from '@/lib/adminApi';
import { format } from 'date-fns';
import { Shield, AlertCircle } from 'lucide-react';

interface AdminAuditLogProps {
  failuresOnly?: boolean;
  limit?: number;
}

export function AdminAuditLog({ failuresOnly = false, limit = 100 }: AdminAuditLogProps) {
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFailuresOnly, setShowFailuresOnly] = useState(failuresOnly);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminApi.getAudit({ limit });
    if (res.ok && res.data) {
      setEvents(res.data.events);
    } else {
      setError(res.error ?? 'Audit unavailable');
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchAudit();
    const interval = setInterval(fetchAudit, 30000);
    return () => clearInterval(interval);
  }, [fetchAudit]);

  const filtered = showFailuresOnly ? events.filter((e) => !e.success) : events;

  if (loading && events.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          Audit Log
        </h3>
        <div className="py-8 text-center text-dark-500 text-sm animate-pulse">Loading audit...</div>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="card border-dark-600">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          Audit Log
        </h3>
        <div className="py-6 text-center text-dark-500 text-sm flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Shield className="w-5 h-5 text-cyan-400" />
        Audit Log
      </h3>
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showFailuresOnly}
            onChange={(e) => setShowFailuresOnly(e.target.checked)}
            className="rounded border-dark-600 bg-dark-700 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-sm text-dark-400">Failures only</span>
        </label>
      </div>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-600">
              <th className="text-left py-2 px-2 text-dark-400 font-medium">Time</th>
              <th className="text-left py-2 px-2 text-dark-400 font-medium">Type</th>
              <th className="text-left py-2 px-2 text-dark-400 font-medium">Action</th>
              <th className="text-left py-2 px-2 text-dark-400 font-medium">Success</th>
              <th className="text-left py-2 px-2 text-dark-400 font-medium">IP</th>
              <th className="text-left py-2 px-2 text-dark-400 font-medium">Path</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={`${e.ts}-${i}`} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                <td className="py-2 px-2 text-dark-300">{format(e.ts, 'MM/dd HH:mm:ss')}</td>
                <td className="py-2 px-2">
                  <span className={e.type === 'admin_auth' ? 'text-cyan-400' : 'text-purple-400'}>{e.type}</span>
                </td>
                <td className="py-2 px-2">{e.action ?? '—'}</td>
                <td className="py-2 px-2">
                  <span className={e.success ? 'text-green-400' : 'text-red-400'}>{e.success ? 'Yes' : 'No'}</span>
                </td>
                <td className="py-2 px-2 font-mono text-xs text-dark-400">{e.ip}</td>
                <td className="py-2 px-2 text-dark-400">{e.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div className="py-6 text-center text-dark-500 text-sm">No audit events</div>
      )}
    </div>
  );
}
