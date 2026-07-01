'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ownerApi from '@/lib/ownerApi';
import { Tenant, TenantStatus, SubscriptionPlan } from '@/types';
import { TenantStatusBadge } from '@/components/TenantStatusBadge';
import { PlanCodeBadge } from '@/components/PlanBadge';
import { Search, Plus, Building2, ChevronRight, Filter } from 'lucide-react';

const STATUS_FILTERS: { label: string; value: TenantStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Trial', value: 'trial' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [status, setStatus] = useState<TenantStatus | 'all'>('all');
  const [planCode, setPlanCode] = useState<string>('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    ownerApi.get<SubscriptionPlan[]>('/platform/plans').then((r) => setPlans(r.data || []));
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (status !== 'all') params.set('status', status);
        if (planCode) params.set('plan', planCode);
        if (search) params.set('search', search);
        const r = await ownerApi.get<{ items: Tenant[]; total: number }>(`/platform/tenants?${params.toString()}`);
        setTenants(r.data.items || []);
        setTotal(r.data.total || 0);
      } finally {
        setIsLoading(false);
      }
    };
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [status, planCode, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Tenants</h1>
          <p className="text-sm text-slate-500 mt-1">{total} total companies using TalentFlow.</p>
        </div>
        <Link
          href="/owner/tenants/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-bold shadow-lg shadow-amber-900/20 hover:shadow-amber-900/40 transition-all"
        >
          <Plus className="w-4 h-4" />
          Onboard Tenant
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company name…"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400" />
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  status === f.value
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {plans.length > 0 && (
            <select
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            >
              <option value="">All plans</option>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading tenants…</div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-600">No tenants match the current filters.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 px-5 py-3">Company</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 px-5 py-3">Status</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 px-5 py-3">Plan</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 px-5 py-3">Employees</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 px-5 py-3">Trial ends</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 px-5 py-3">Created</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0">
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                        <p className="text-xs text-slate-500 truncate">{t.description || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <TenantStatusBadge status={t.tenant_status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <PlanCodeBadge code={t.plan_code} />
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-700">
                    {t.employee_count ?? '—'}{' '}
                    <span className="text-xs text-slate-400">/ {t.max_employees}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/owner/tenants/${t.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"
                    >
                      Manage
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
