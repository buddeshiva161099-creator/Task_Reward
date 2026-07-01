'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ownerApi from '@/lib/ownerApi';
import { Tenant, TenantDetail, SubscriptionPlan, TenantStatus, TenantAdmin, ResetAdminPasswordResponse } from '@/types';
import { TenantStatusBadge } from '@/components/TenantStatusBadge';
import { PlanCodeBadge } from '@/components/PlanBadge';
import {
  Building2,
  ChevronLeft,
  Power,
  PowerOff,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Users,
  CreditCard,
  RefreshCw,
  Ban,
  ScrollText,
  KeyRound,
  Copy,
  ShieldCheck,
  ShieldOff,
  Clock,
} from 'lucide-react';

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspend, setShowSuspend] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<{ adminEmail: string; password: string } | null>(null);
  const [accessDaysInput, setAccessDaysInput] = useState<number | ''>('');

  const load = async () => {
    setIsLoading(true);
    try {
      const [t, p, a] = await Promise.all([
        ownerApi.get<TenantDetail>(`/platform/tenants/${params.id}`),
        ownerApi.get<SubscriptionPlan[]>('/platform/plans'),
        ownerApi.get<{ items: TenantAdmin[]; total: number }>(`/platform/tenants/${params.id}/admins`),
      ]);
      setTenant(t.data);
      setPlans(p.data || []);
      setSelectedPlan(t.data.plan_code || '');
      setAdmins(a.data?.items || []);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || 'Failed to load tenant details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) load();
  }, [params.id]);

  useEffect(() => {
    if (tenant?.trial_ends_at) {
      const diff = new Date(tenant.trial_ends_at).getTime() - new Date().getTime();
      const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      setAccessDaysInput(days);
    } else {
      setAccessDaysInput('');
    }
  }, [tenant]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3500);
  };
  const showError = (msg: string) => {
    setError(msg);
    setSuccess(null);
  };

  const changeStatus = async (status: TenantStatus, reason?: string) => {
    setActionLoading(`status-${status}`);
    try {
      await ownerApi.patch(`/platform/tenants/${params.id}/status`, { status, reason });
      showSuccess(`Tenant ${status === 'active' ? 'activated' : status === 'suspended' ? 'suspended' : status}.`);
      setShowSuspend(false);
      setSuspendReason('');
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showError(err.response?.data?.detail || 'Failed to update status.');
    } finally {
      setActionLoading(null);
    }
  };

  const changePlan = async () => {
    if (!selectedPlan) return;
    setActionLoading('plan');
    try {
      await ownerApi.patch(`/platform/tenants/${params.id}/plan`, {
        plan_code: selectedPlan,
      });
      showSuccess('Plan updated.');
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showError(err.response?.data?.detail || 'Failed to change plan.');
    } finally {
      setActionLoading(null);
    }
  };

  const changeAccessDays = async (days: number) => {
    if (days < 0) return;
    setActionLoading('access-days');
    try {
      await ownerApi.patch(`/platform/tenants/${params.id}/access-days`, {
        trial_days: days,
      });
      showSuccess(`Access period updated to ${days} days remaining.`);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showError(err.response?.data?.detail || 'Failed to update access duration.');
    } finally {
      setActionLoading(null);
    }
  };

  const resetAdminPassword = async (admin: TenantAdmin) => {
    if (!confirm(`Generate a new temporary password for ${admin.email}? They will be required to change it on next login.`)) {
      return;
    }
    setActionLoading(`reset-${admin.id}`);
    try {
      const r = await ownerApi.post<ResetAdminPasswordResponse>(
        `/platform/tenants/${params.id}/admins/${admin.id}/reset-password`,
        {}
      );
      setRevealedPassword({ adminEmail: r.data.admin_email, password: r.data.temp_password });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, must_change_password: true } : a)));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('Copied to clipboard.');
    } catch {
      showError('Could not copy to clipboard.');
    }
  };

  if (isLoading) {
    return <div className="text-slate-500 text-sm">Loading tenant…</div>;
  }
  if (!tenant) {
    return <div className="text-rose-600 text-sm">Tenant not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/owner/tenants" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900">
          <ChevronLeft className="w-3.5 h-3.5" />
          Tenants
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center font-extrabold text-2xl">
              {tenant.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">{tenant.name}</h1>
              <div className="flex items-center gap-2 mt-1.5">
                <TenantStatusBadge status={tenant.tenant_status} />
                <PlanCodeBadge code={tenant.plan_code} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Employees" value={`${tenant.employee_count ?? 0} / ${tenant.max_employees}`} icon={Users} />
        <Stat label="Admins" value={`${tenant.admin_count ?? 0}`} icon={Users} />
        <Stat
          label="Business Units"
          value={`${tenant.business_unit_count ?? 0}`}
          icon={Building2}
        />
        <Stat
          label="Trial Ends"
          value={tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString() : '—'}
          icon={Calendar}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-600" />
            Business Units
          </h2>
          <span className="text-xs text-slate-500">
            Sub-organizations (branches, departments, subsidiaries) within this tenant.
          </span>
        </div>
        {tenant.business_unit_summary && tenant.business_unit_summary.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tenant.business_unit_summary.map((u) => (
              <div
                key={u.id}
                className="p-3 border border-slate-200 rounded-lg flex items-center justify-between bg-slate-50"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    {u.name}
                    {u.is_default && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 capitalize">{u.type}</div>
                </div>
                <div className="flex items-center gap-2">
                  {u.is_active ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500 italic">No business units configured.</div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Lifecycle Actions</h2>

        {tenant.suspended_reason && tenant.tenant_status === 'suspended' && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
            <span className="font-semibold">Suspension reason:</span> {tenant.suspended_reason}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {tenant.tenant_status !== 'active' && (
            <button
              onClick={() => changeStatus('active')}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Power className="w-4 h-4" />
              Activate
            </button>
          )}
          {tenant.tenant_status !== 'suspended' && (
            <button
              onClick={() => setShowSuspend(true)}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <PowerOff className="w-4 h-4" />
              Suspend
            </button>
          )}
          {tenant.tenant_status === 'suspended' && (
            <button
              onClick={() => changeStatus('cancelled', 'Cancelled by owner')}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Ban className="w-4 h-4" />
              Cancel Tenant
            </button>
          )}
          <button
            onClick={() => load()}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {showSuspend && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200">
            <label className="block text-xs font-bold uppercase tracking-wider text-rose-700 mb-1.5">
              Reason for suspension
            </label>
            <input
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Non-payment, ToS violation"
              className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg text-sm mb-3"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeStatus('suspended', suspendReason || 'No reason provided')}
                disabled={!suspendReason || actionLoading !== null}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                Confirm Suspend
              </button>
              <button
                onClick={() => {
                  setShowSuspend(false);
                  setSuspendReason('');
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Subscription Plan</h2>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Current plan
            </label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800"
            >
              <option value="">No plan</option>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} – ₹{p.price_monthly}/mo (max {p.max_employees} employees)
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={changePlan}
            disabled={actionLoading === 'plan' || selectedPlan === tenant.plan_code}
            className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-30"
          >
            {actionLoading === 'plan' ? 'Updating…' : 'Update Plan'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Access Period / Trial Duration</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Days of Access Remaining
              </label>
              <input
                type="number"
                min="0"
                max="365"
                value={accessDaysInput}
                onChange={(e) => setAccessDaysInput(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800"
              />
            </div>
            <button
              onClick={() => changeAccessDays(Number(accessDaysInput))}
              disabled={actionLoading === 'access-days' || accessDaysInput === ''}
              className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-30 whitespace-nowrap"
            >
              {actionLoading === 'access-days' ? 'Updating…' : 'Set Days'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => {
                const current = typeof accessDaysInput === 'number' ? accessDaysInput : 0;
                const next = current + 7;
                setAccessDaysInput(next);
                changeAccessDays(next);
              }}
              disabled={actionLoading !== null}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              + 7 Days
            </button>
            <button
              onClick={() => {
                const current = typeof accessDaysInput === 'number' ? accessDaysInput : 0;
                const next = Math.max(0, current - 7);
                setAccessDaysInput(next);
                changeAccessDays(next);
              }}
              disabled={actionLoading !== null || (typeof accessDaysInput === 'number' && accessDaysInput <= 0)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              - 7 Days
            </button>
            <button
              onClick={() => {
                const current = typeof accessDaysInput === 'number' ? accessDaysInput : 0;
                const next = current + 30;
                setAccessDaysInput(next);
                changeAccessDays(next);
              }}
              disabled={actionLoading !== null}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              + 30 Days
            </button>
            <button
              onClick={() => {
                const current = typeof accessDaysInput === 'number' ? accessDaysInput : 0;
                const next = Math.max(0, current - 30);
                setAccessDaysInput(next);
                changeAccessDays(next);
              }}
              disabled={actionLoading !== null || (typeof accessDaysInput === 'number' && accessDaysInput <= 0)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              - 30 Days
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-900">Tenant Admins</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {admins.length} {admins.length === 1 ? 'admin' : 'admins'}
          </span>
        </div>

        {revealedPassword && (
          <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-300">
            <div className="flex items-start gap-2 mb-2">
              <KeyRound className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  New password for {revealedPassword.adminEmail}
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Share securely with the admin. They must change it on next login. This will not be shown again.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-lg font-mono text-sm text-slate-900 select-all">
                {revealedPassword.password}
              </code>
              <button
                onClick={() => copyToClipboard(revealedPassword.password)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
              <button
                onClick={() => setRevealedPassword(null)}
                className="px-3 py-2 rounded-lg border border-amber-300 text-amber-800 text-xs font-semibold hover:bg-amber-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {admins.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No admins for this tenant.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {admins.map((a) => (
              <div key={a.id} className="py-3 first:pt-0 last:pb-0 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {a.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 truncate">{a.name}</p>
                    {a.is_active ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                        <ShieldOff className="w-2.5 h-2.5" />
                        Inactive
                      </span>
                    )}
                    {a.must_change_password && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700">
                        <KeyRound className="w-2.5 h-2.5" />
                        Must change password
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{a.email}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {a.last_login_at
                      ? `Last login: ${new Date(a.last_login_at).toLocaleString()}`
                      : 'Never logged in'}
                  </p>
                </div>
                <button
                  onClick={() => resetAdminPassword(a)}
                  disabled={actionLoading !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-50 shrink-0"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {actionLoading === `reset-${a.id}` ? 'Resetting…' : 'Reset password'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-2">
        <ScrollText className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-600">
          Every action you take is permanently recorded in the{' '}
          <Link href="/owner/audit" className="text-amber-700 font-semibold hover:underline">
            platform audit log
          </Link>{' '}
          with your identity, timestamp, and reason.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="text-lg font-extrabold text-slate-900">{value}</div>
    </div>
  );
}
