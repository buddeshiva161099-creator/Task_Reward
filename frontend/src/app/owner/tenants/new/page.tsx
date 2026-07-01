'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ownerApi from '@/lib/ownerApi';
import { OnboardTenantRequest, OnboardTenantResponse, SubscriptionPlan } from '@/types';
import {
  Building2,
  User,
  CreditCard,
  Check,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Copy,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

const STEPS = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'admin', label: 'Primary Admin', icon: User },
  { key: 'plan', label: 'Plan & Trial', icon: CreditCard },
] as const;

const DEFAULT_WORK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function OnboardTenantPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardTenantResponse | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState<OnboardTenantRequest>({
    tenant_name: '',
    admin_name: '',
    admin_email: '',
    plan_code: 'starter',
    trial_days: 14,
    work_days: DEFAULT_WORK_DAYS,
    work_start_time: '09:00',
    work_end_time: '18:00',
  });

  useEffect(() => {
    ownerApi.get<SubscriptionPlan[]>('/platform/plans').then((r) => {
      setPlans(r.data || []);
    });
  }, []);

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!form.tenant_name || form.tenant_name.trim().length < 2) {
        return 'Company name is required (min 2 characters).';
      }
    }
    if (step === 1) {
      if (!form.admin_name || form.admin_name.trim().length < 2) {
        return 'Admin name is required.';
      }
      if (!form.admin_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.admin_email)) {
        return 'A valid admin email is required.';
      }
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await ownerApi.post<OnboardTenantResponse>('/platform/tenants', form);
      setResult(r.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || 'Failed to create tenant.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.temp_password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (result) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-4 shadow-lg">
            <Check className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Tenant Onboarded!</h1>
          <p className="text-sm text-slate-600 mt-2">
            <span className="font-semibold">{result.tenant.name}</span> is now live on TalentFlow.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Primary Admin Credentials</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Name</p>
                <p className="text-sm font-semibold text-slate-900">{result.admin.name}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Email</p>
                <p className="text-sm font-semibold text-slate-900">{result.admin.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-amber-700">Temporary Password</p>
                <p className="text-sm font-mono font-bold text-slate-900 break-all">
                  {showPassword ? result.temp_password : '••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-2 hover:bg-amber-100 rounded-lg text-amber-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={copyPassword}
                  className="p-2 hover:bg-amber-100 rounded-lg text-amber-700"
                  title="Copy"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          {copied && (
            <p className="mt-2 text-xs text-emerald-700 font-semibold">Copied to clipboard.</p>
          )}
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700">{result.warning}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link
            href="/owner/tenants"
            className="text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            ← Back to tenants
          </Link>
          <Link
            href={`/owner/tenants/${result.tenant.id}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
          >
            Manage tenant
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/owner/tenants" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          ← Tenants
        </Link>
        <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Onboard New Tenant</h1>
        <p className="text-sm text-slate-500 mt-1">Create a new company account and its first administrator.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-initial">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
                      isActive
                        ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-900/20'
                        : isDone
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      isActive ? 'text-slate-900' : isDone ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Company Name *
              </label>
              <input
                value={form.tenant_name}
                onChange={(e) => setForm({ ...form, tenant_name: e.target.value })}
                placeholder="e.g. Acme Corp"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Work Start
                </label>
                <input
                  type="time"
                  value={form.work_start_time}
                  onChange={(e) => setForm({ ...form, work_start_time: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Work End
                </label>
                <input
                  type="time"
                  value={form.work_end_time}
                  onChange={(e) => setForm({ ...form, work_end_time: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Admin Full Name *
              </label>
              <input
                value={form.admin_name}
                onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                placeholder="e.g. John Smith"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Admin Email *
              </label>
              <input
                type="email"
                value={form.admin_email}
                onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                placeholder="admin@acme.com"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                A temporary password will be generated and shown once after submission.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Subscription Plan
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {plans.map((p) => {
                  const isSelected = form.plan_code === p.code;
                  return (
                    <button
                      key={p.code}
                      onClick={() =>
                        setForm({ ...form, plan_code: p.code, trial_days: p.trial_days })
                      }
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-slate-900">{p.name}</p>
                        {p.is_default && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-2 line-clamp-2">{p.description}</p>
                      <p className="text-lg font-extrabold text-slate-900">
                        ₹{p.price_monthly}
                        <span className="text-xs font-normal text-slate-500">/mo</span>
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        up to {p.max_employees} employees · {p.trial_days}-day trial
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Trial Days
              </label>
              <input
                type="number"
                min={0}
                max={180}
                value={form.trial_days ?? 14}
                onChange={(e) => setForm({ ...form, trial_days: parseInt(e.target.value) || 0 })}
                className="w-32 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <p className="text-xs text-indigo-900">
                The admin will be required to change the temporary password on first login.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={back}
            disabled={step === 0 || submitting}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="inline-flex items-center gap-1 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-bold shadow-lg shadow-amber-900/20 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Tenant'}
              {!submitting && <Check className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
