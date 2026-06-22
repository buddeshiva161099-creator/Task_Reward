'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ownerApi from '@/lib/ownerApi';
import { OwnerMetricCard } from '@/components/OwnerMetricCard';
import { TenantStatusBadge } from '@/components/TenantStatusBadge';
import { PlanCodeBadge } from '@/components/PlanBadge';
import { PlatformMetrics, PlatformAuditEntry } from '@/types';
import {
  Building2,
  Users,
  Crown,
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  ScrollText,
  Plus,
  ArrowRight,
} from 'lucide-react';

export default function OwnerDashboardPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [audit, setAudit] = useState<PlatformAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [m, a] = await Promise.all([
          ownerApi.get<PlatformMetrics>('/platform/metrics'),
          ownerApi.get<{ items: PlatformAuditEntry[] }>('/platform/audit-log?limit=8'),
        ]);
        setMetrics(m.data);
        setAudit(a.data.items || []);
      } catch (e) {
        console.error('Failed to load owner dashboard', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return <div className="text-slate-500 text-sm">Loading metrics…</div>;
  }

  if (!metrics) {
    return <div className="text-rose-600 text-sm">Failed to load metrics.</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Owner Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Manage every tenant running on TaskReward.</p>
        </div>
        <Link
          href="/owner/tenants/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-bold shadow-lg shadow-amber-900/20 hover:shadow-amber-900/40 transition-all"
        >
          <Plus className="w-4 h-4" />
          Onboard New Tenant
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <OwnerMetricCard
          label="Total Tenants"
          value={metrics.tenants?.total ?? 0}
          icon={Building2}
          accent="indigo"
          hint={`+${metrics.tenants?.new_last_30_days ?? 0} in last 30 days`}
        />
        <OwnerMetricCard
          label="Active"
          value={metrics.tenants?.active ?? 0}
          icon={CheckCircle2}
          accent="emerald"
        />
        <OwnerMetricCard
          label="On Trial"
          value={metrics.tenants?.trial ?? 0}
          icon={Clock}
          accent="amber"
        />
        <OwnerMetricCard
          label="Suspended"
          value={metrics.tenants?.suspended ?? 0}
          icon={AlertCircle}
          accent="rose"
        />
        <OwnerMetricCard
          label="Total Users"
          value={metrics.users?.total ?? 0}
          icon={Users}
          accent="slate"
          hint={`${metrics.users?.admins ?? 0} admins · ${metrics.users?.employees ?? 0} employees`}
        />
        <OwnerMetricCard
          label="Subscription Plans"
          value={metrics.plans?.total_plans ?? 0}
          icon={Crown}
          accent="amber"
        />
        <OwnerMetricCard
          label="Cancelled"
          value={metrics.tenants?.cancelled ?? 0}
          icon={Activity}
          accent="slate"
        />
        <OwnerMetricCard
          label="Active Plans"
          value={Object.keys(metrics.plans?.by_code || {}).length}
          icon={Building2}
          accent="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Audit Activity</h3>
              <p className="text-xs text-slate-500 mt-0.5">Latest platform owner actions</p>
            </div>
            <Link
              href="/owner/audit"
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {audit.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-8">No audit events yet.</div>
          ) : (
            <ul className="space-y-3">
              {audit.map((e) => (
                <li key={e.id} className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <ScrollText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{e.action}</p>
                      {e.timestamp && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(e.timestamp).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">{e.description || `${e.entity_type} ${e.action}`}</p>
                    {e.actor_email && (
                      <p className="text-[10px] text-slate-400 mt-0.5">by {e.actor_email}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Tenant Signups</h3>
              <p className="text-xs text-slate-500 mt-0.5">First 10 users created in the last 7 days</p>
            </div>
          </div>
          {(!metrics.recent_signups || metrics.recent_signups.length === 0) ? (
            <div className="text-xs text-slate-500 text-center py-8">No recent signups.</div>
          ) : (
            <ul className="space-y-3">
              {metrics.recent_signups.slice(0, 8).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                      {(u.name || "").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{u.name}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">{u.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Plan Distribution</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(metrics.plans?.by_code || {}).map(([code, count]) => (
            <div key={code} className="flex items-center justify-between p-4 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <PlanCodeBadge code={code} />
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{count}</div>
            </div>
          ))}
          {Object.keys(metrics.plans?.by_code || {}).length === 0 && (
            <div className="col-span-3 text-xs text-slate-500 text-center py-6">
              No tenants assigned to a plan yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
