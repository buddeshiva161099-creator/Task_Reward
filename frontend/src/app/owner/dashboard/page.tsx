'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ownerApi from '@/lib/ownerApi';
import { OwnerMetricCard } from '@/components/OwnerMetricCard';
import { TenantStatusBadge } from '@/components/TenantStatusBadge';
import { PlanCodeBadge } from '@/components/PlanBadge';
import { PlatformMetrics, PlatformAuditEntry, Tenant } from '@/types';
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
  Coins,
  Database,
  Award,
  CheckSquare,
  CalendarRange,
} from 'lucide-react';

export default function OwnerDashboardPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [audit, setAudit] = useState<PlatformAuditEntry[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('all');
  const [initialLoading, setInitialLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const initData = async () => {
      try {
        const [tenantsRes, auditRes] = await Promise.all([
          ownerApi.get<{ items: Tenant[]; total: number }>('/platform/tenants?limit=200'),
          ownerApi.get<{ items: PlatformAuditEntry[] }>('/platform/audit-log?limit=8'),
        ]);
        setTenants(tenantsRes.data.items || []);
        setAudit(auditRes.data.items || []);
      } catch (e) {
        console.error('Failed to load initial owner dashboard data', e);
      } finally {
        setInitialLoading(false);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    const fetchMetrics = async () => {
      setMetricsLoading(true);
      setHasError(false);
      try {
        const url = selectedTenant === 'all'
          ? '/platform/metrics'
          : `/platform/metrics?tenant_id=${selectedTenant}`;
        const m = await ownerApi.get<PlatformMetrics>(url);
        setMetrics(m.data);
      } catch (e) {
        console.error('Failed to load owner metrics', e);
        setHasError(true);
      } finally {
        setMetricsLoading(false);
      }
    };
    fetchMetrics();
  }, [selectedTenant]);

  if (initialLoading || (!metrics && !hasError)) {
    return <div className="text-slate-500 text-sm p-6 animate-pulse">Loading dashboard metrics…</div>;
  }

  if (hasError) {
    return <div className="text-rose-600 text-sm p-6">Failed to load metrics.</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Owner Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and monitor tenants running on TaskReward.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scope:</span>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer shadow-sm min-w-[200px]"
            >
              <option value="all">All Tenants (Overall)</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <Link
            href="/owner/tenants/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-bold shadow-md shadow-amber-900/10 hover:shadow-amber-900/35 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            Onboard New Tenant
          </Link>
        </div>
      </div>

      <div className={metricsLoading ? "space-y-8 opacity-60 pointer-events-none transition-all duration-300" : "space-y-8 transition-all duration-300"}>
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

      {/* Enhanced Platform Insights & Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Estimated MRR & Revenue */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl flex flex-col justify-between border border-slate-800">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">Estimated Revenue</span>
              <Coins className="w-5 h-5 text-amber-400" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(metrics.mrr ?? 0)}
            </h2>
            <p className="text-xs text-indigo-200 mt-1">Monthly Recurring Revenue (MRR)</p>
          </div>
          <div className="mt-8 pt-4 border-t border-indigo-900/50 flex items-center justify-between text-xs text-indigo-300">
            <span>Based on active subscriptions</span>
            <span className="font-semibold text-emerald-400">100% Secure</span>
          </div>
        </div>

        {/* Database Health Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Database Diagnostics</span>
              <Database className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Storage Used</span>
                <span className="font-bold text-slate-800">{metrics.db_stats?.storage_size_mb ?? 0} MB</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Data Size</span>
                <span className="font-bold text-slate-800">{metrics.db_stats?.data_size_mb ?? 0} MB</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Index Size</span>
                <span className="font-bold text-slate-800">{metrics.db_stats?.index_size_mb ?? 0} MB</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Collections: <strong className="text-slate-700">{metrics.db_stats?.collections ?? 0}</strong></span>
            <span>Documents: <strong className="text-slate-700">{metrics.db_stats?.objects ?? 0}</strong></span>
          </div>
        </div>

        {/* User Engagement Analytics */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">System Engagement</span>
              <Activity className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><CheckSquare className="w-3.5 h-3.5" /> Task Completion</span>
                <span className="font-bold text-slate-800">
                  {metrics.engagement?.completed_tasks ?? 0} / {metrics.engagement?.total_tasks ?? 0}
                  <span className="text-xs font-normal text-slate-500 ml-1.5">
                    ({metrics.engagement?.total_tasks ? Math.round((metrics.engagement.completed_tasks / metrics.engagement.total_tasks) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><CalendarRange className="w-3.5 h-3.5" /> Attendance Check-ins</span>
                <span className="font-bold text-slate-800">{metrics.engagement?.total_attendance ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-amber-500" /> Reward Points Given</span>
                <span className="font-bold text-amber-600">{metrics.engagement?.total_reward_points ?? 0} pts</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
            Engagement health score is <strong className="text-emerald-600">Optimal</strong>
          </div>
        </div>
      </div>

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
