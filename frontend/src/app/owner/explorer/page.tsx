'use client';

import { useEffect, useState, useRef } from 'react';
import ownerApi from '@/lib/ownerApi';
import { Tenant, SubscriptionPlan } from '@/types';
import {
  Building2,
  Users,
  Calendar,
  Clock,
  Shield,
  Layers,
  Search,
  Eye,
  Trash2,
  AlertTriangle,
  Info,
  DollarSign,
  TrendingUp,
  MapPin,
  CheckCircle2,
  Activity,
  Key,
  Edit3,
  Check,
  X
} from 'lucide-react';

interface ExplorerData {
  tenant: {
    id: string;
    name: string;
    description: string;
    tenant_status: string;
    is_active: boolean;
    created_at: string;
    work_days: string[];
    work_start_time: string;
    work_end_time: string;
    office_lat: number;
    office_lng: number;
    geofence_radius_meters: number;
    geofence_policy: string;
    attendance_points: Record<string, number>;
  };
  subscription_plan: {
    name: string;
    code: string;
    price_monthly: number;
    max_employees: number;
  } | null;
  companies: Array<{ id: string; name: string; is_active: boolean }>;
  business_units: Array<{ id: string; name: string; company_id: string | null }>;
  employees: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    primary_company_id: string | null;
    business_unit_id: string | null;
    is_active: boolean;
    must_change_password: boolean;
    reward_points: number;
  }>;
  stats: {
    active_employees: number;
    max_employees: number;
    storage_mb: number;
    tasks_count: number;
    attendance_count: number;
  };
  drift: {
    drift_detected: boolean;
    drifted_points: Record<string, { default: number; current: number }>;
  };
  billing_simulator: {
    base_rate: number;
    employee_surcharge: number;
    total_invoice: number;
    next_billing_date: string;
  };
  engagement_trend: Array<{ date: string; count: number }>;
}

export default function TenantExplorerPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [data, setData] = useState<ExplorerData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'policies' | 'org' | 'employees' | 'analytics'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{ tasks: number; notifications: number } | null>(null);

  // Configuration Edit States
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [saveConfigLoading, setSaveConfigLoading] = useState(false);
  const [workStartTime, setWorkStartTime] = useState('');
  const [workEndTime, setWorkEndTime] = useState('');
  const [geofencePolicy, setGeofencePolicy] = useState('flexible');
  const [officeLat, setOfficeLat] = useState(0);
  const [officeLng, setOfficeLng] = useState(0);
  const [geofenceRadius, setGeofenceRadius] = useState(500);

  // Temporary password reset modal state
  const [tempPasswordReset, setTempPasswordReset] = useState<{ name: string; email: string; pass: string } | null>(null);

  // Fetch tenants on mount
  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const res = await ownerApi.get<{ items: Tenant[]; total: number }>('/platform/tenants?limit=200');
        setTenants(res.data.items || []);
        if (res.data.items && res.data.items.length > 0) {
          setSelectedTenantId(res.data.items[0].id);
        }
      } catch (e) {
        console.error('Failed to load tenants list', e);
      }
    };
    fetchTenants();
  }, []);

  // Fetch explorer data for selected tenant
  useEffect(() => {
    if (!selectedTenantId) return;

    const fetchExplorerData = async () => {
      setIsLoading(true);
      setPurgeResult(null);
      setIsEditingConfig(false);
      try {
        const res = await ownerApi.get<ExplorerData>(`/platform/tenants/${selectedTenantId}/explorer`);
        setData(res.data);
      } catch (e) {
        console.error('Failed to fetch tenant explorer data', e);
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchExplorerData();
  }, [selectedTenantId]);

  // Sync edit configurations when data updates
  useEffect(() => {
    if (data?.tenant) {
      setWorkStartTime(data.tenant.work_start_time || '09:30');
      setWorkEndTime(data.tenant.work_end_time || '18:30');
      setGeofencePolicy(data.tenant.geofence_policy || 'flexible');
      setOfficeLat(data.tenant.office_lat || 0.0);
      setOfficeLng(data.tenant.office_lng || 0.0);
      setGeofenceRadius(data.tenant.geofence_radius_meters || 500);
    }
  }, [data]);

  const handleImpersonate = async (userId: string) => {
    try {
      const res = await ownerApi.post<{ access_token: string; user: { role: string } }>(
        `/platform/tenants/${selectedTenantId}/impersonate/${userId}`
      );
      const { role } = res.data.user;
      
      const redirectUrl =
        role === 'admin' || role === 'hr_manager' || role === 'manager'
          ? '/admin/dashboard'
          : '/employee/dashboard';
      
      window.open(redirectUrl, '_blank');
    } catch (e) {
      alert('Impersonation failed: User session could not be established.');
      console.error(e);
    }
  };

  const handlePurge = async () => {
    if (!confirm('Are you sure you want to purge tasks completed over 1 year ago and notifications older than 90 days?')) return;
    setPurgeLoading(true);
    try {
      const res = await ownerApi.post<{ purged_tasks: number; purged_notifications: number }>(
        `/platform/tenants/${selectedTenantId}/purge`
      );
      setPurgeResult({
        tasks: res.data.purged_tasks,
        notifications: res.data.purged_notifications
      });
      const refreshRes = await ownerApi.get<ExplorerData>(`/platform/tenants/${selectedTenantId}/explorer`);
      setData(refreshRes.data);
    } catch (e) {
      console.error('Purge request failed', e);
      alert('Purge failed to complete.');
    } finally {
      setPurgeLoading(false);
    }
  };

  const handleResetPassword = async (userId: string, userName: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to reset the password for ${userName} (${userEmail})?`)) return;
    try {
      const res = await ownerApi.post<{ temp_password: string }>(
        `/platform/tenants/${selectedTenantId}/users/${userId}/reset-password`
      );
      setTempPasswordReset({
        name: userName,
        email: userEmail,
        pass: res.data.temp_password
      });
    } catch (e) {
      console.error(e);
      alert('Failed to reset user password.');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveConfigLoading(true);
    try {
      await ownerApi.patch(`/platform/tenants/${selectedTenantId}/config`, {
        work_start_time: workStartTime,
        work_end_time: workEndTime,
        geofence_policy: geofencePolicy,
        office_lat: Number(officeLat),
        office_lng: Number(officeLng),
        geofence_radius_meters: Number(geofenceRadius)
      });
      alert('Configurations saved successfully!');
      setIsEditingConfig(false);
      const refreshRes = await ownerApi.get<ExplorerData>(`/platform/tenants/${selectedTenantId}/explorer`);
      setData(refreshRes.data);
    } catch (e) {
      console.error(e);
      alert('Failed to save configurations.');
    } finally {
      setSaveConfigLoading(false);
    }
  };

  // Filter employees based on search query
  const filteredEmployees = data?.employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-8">
      {/* Top Selector Block */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-amber-500" />
            Tenant Explorer
          </h1>
          <p className="text-sm text-slate-500 mt-1">Deep-inspect configurations, systems, compliance, and accounts.</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Tenant:</label>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer min-w-[240px] shadow-inner"
          >
            <option value="" disabled>-- Choose Tenant --</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
          <div className="text-slate-500 text-sm animate-pulse flex items-center gap-2">
            <Activity className="w-5 h-5 animate-spin text-amber-500" />
            Retrieving tenant metadata...
          </div>
        </div>
      )}

      {!isLoading && !data && selectedTenantId && (
        <div className="p-6 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-sm">
          Failed to load metadata details for the selected tenant.
        </div>
      )}

      {!isLoading && data && (
        <div className="space-y-6">
          {/* Tab Selection */}
          <div className="flex border-b border-slate-200 overflow-x-auto gap-6">
            {(['overview', 'policies', 'org', 'employees', 'analytics'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-4 px-1 text-sm font-bold border-b-2 capitalize transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab === 'org' ? 'Hierarchy' : tab}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW & BILLING */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profile Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{data.tenant.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Joined on {new Date(data.tenant.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="space-y-3.5 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">SaaS Health Status</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                      data.tenant.tenant_status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {data.tenant.tenant_status}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Subscription Plan</span>
                    <span className="font-bold text-slate-700">{data.subscription_plan?.name || 'No Active Plan'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">File Storage Size</span>
                    <span className="font-bold text-slate-700">{data.stats.storage_mb} MB</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Total System Tasks</span>
                    <span className="font-bold text-slate-700">{data.stats.tasks_count} tasks</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Total Attendance Logs</span>
                    <span className="font-bold text-slate-700">{data.stats.attendance_count} sessions</span>
                  </div>
                </div>

                {/* Quota Progress */}
                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>License Seats</span>
                    <span>{data.stats.active_employees} / {data.stats.max_employees} Users</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (data.stats.active_employees / data.stats.max_employees) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Billing Simulator Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Invoice Simulator</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Calculated next cycle estimates</p>
                  </div>
                </div>

                <div className="space-y-3.5 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Base Plan Rate</span>
                    <span className="font-semibold text-slate-700">${(data.billing_simulator.base_rate ?? 0).toFixed(2)}/mo</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Extra Seat Surcharges</span>
                    <span className="font-semibold text-slate-700">${(data.billing_simulator.employee_surcharge ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Billing Date</span>
                    <span className="font-bold text-slate-700">{data.billing_simulator.next_billing_date}</span>
                  </div>

                  <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Total Invoice Amount</span>
                    <span className="text-xl font-black text-emerald-600">${(data.billing_simulator.total_invoice ?? 0).toFixed(2)}</span>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 flex gap-2 border border-slate-100">
                  <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Invoice estimate aggregates base plan pricing and seat overrides (+$150/user for seats exceeding 10).
                  </p>
                </div>
              </div>

              {/* Data Cleanup Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Resource Cleanup</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Purge transactional clutter</p>
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Permanently delete completed tasks older than 1 year and notification/logs older than 90 days to release disk and database indexes.
                </p>

                <div className="pt-2">
                  <button
                    onClick={handlePurge}
                    disabled={purgeLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 text-sm font-bold transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {purgeLoading ? 'Cleaning system resources...' : 'Purge Stale Records'}
                  </button>
                </div>

                {purgeResult && (
                  <div className="bg-emerald-50 rounded-xl p-3.5 border border-emerald-100 flex items-start gap-2.5 text-emerald-800 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Cleanup Successful!</p>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px]">
                        <li>Tasks deleted: {purgeResult.tasks}</li>
                        <li>Logs/Notifications deleted: {purgeResult.notifications}</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SCHEDULER & POLICIES */}
          {activeTab === 'policies' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Operational configurations */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between min-h-[360px]">
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-500" />
                      Work Schedule & Geofencing Settings
                    </h3>
                    
                    {!isEditingConfig && (
                      <button
                        onClick={() => setIsEditingConfig(true)}
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-bold hover:underline"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Config
                      </button>
                    )}
                  </div>

                  {isEditingConfig ? (
                    <form onSubmit={handleSaveConfig} className="space-y-4 text-xs font-semibold">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-slate-500 uppercase block">Work Start Time</label>
                          <input
                            type="text"
                            value={workStartTime}
                            onChange={(e) => setWorkStartTime(e.target.value)}
                            placeholder="09:30"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-slate-500 uppercase block">Work End Time</label>
                          <input
                            type="text"
                            value={workEndTime}
                            onChange={(e) => setWorkEndTime(e.target.value)}
                            placeholder="18:30"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-slate-500 uppercase block">Geofence Policy</label>
                          <select
                            value={geofencePolicy}
                            onChange={(e) => setGeofencePolicy(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                          >
                            <option value="flexible">Flexible</option>
                            <option value="strict">Strict</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-slate-500 uppercase block">Geofence Radius (m)</label>
                          <input
                            type="number"
                            value={geofenceRadius}
                            onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                            placeholder="500"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-slate-500 uppercase block">Latitude</label>
                          <input
                            type="number"
                            step="any"
                            value={officeLat}
                            onChange={(e) => setOfficeLat(Number(e.target.value))}
                            placeholder="12.9716"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-slate-500 uppercase block">Longitude</label>
                          <input
                            type="number"
                            step="any"
                            value={officeLng}
                            onChange={(e) => setOfficeLng(Number(e.target.value))}
                            placeholder="77.5946"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end gap-3.5">
                        <button
                          type="button"
                          onClick={() => setIsEditingConfig(false)}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saveConfigLoading}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        >
                          {saveConfigLoading ? 'Saving...' : 'Save Rules'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-5 text-sm">
                        <div>
                          <span className="text-slate-400 block text-xs uppercase font-bold">Standard Work Hours</span>
                          <span className="font-bold text-slate-700 block mt-1">
                            {data.tenant.work_start_time} - {data.tenant.work_end_time}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs uppercase font-bold">Geofence Policy</span>
                          <span className="font-bold text-slate-700 block mt-1 capitalize">{data.tenant.geofence_policy}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs uppercase font-bold">Geofence Bounds</span>
                          <span className="font-bold text-slate-700 block mt-1 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {data.tenant.office_lat != null ? data.tenant.office_lat.toFixed(4) : 'N/A'}, {data.tenant.office_lng != null ? data.tenant.office_lng.toFixed(4) : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs uppercase font-bold">Allowed Radius</span>
                          <span className="font-bold text-slate-700 block mt-1">{data.tenant.geofence_radius_meters} meters</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-50">
                        <span className="text-slate-400 block text-xs uppercase font-bold mb-1.5">Assigned Work Days</span>
                        <div className="flex gap-1.5">
                          {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => {
                            const isActive = data.tenant.work_days.includes(d);
                            return (
                              <span
                                key={d}
                                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-extrabold capitalize border transition-all ${
                                  isActive
                                    ? 'bg-amber-50 text-white border-amber-600 shadow-sm'
                                    : 'bg-slate-50 text-slate-400 border-slate-100'
                                }`}
                              >
                                {d.slice(0, 2)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Policy Drift check */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2 border-b border-slate-100 pb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Policy Drift Audit (Rules vs. System Template)
                </h3>

                {!data.drift.drift_detected ? (
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>Compliance OK: This tenant's scoring settings match standard defaults.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 text-amber-800 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <span>Custom overrides detected on this tenant's scoring mechanics.</span>
                    </div>

                    <div className="overflow-hidden border border-slate-100 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                            <th className="p-3">Rule Keyword</th>
                            <th className="p-3">Template Default</th>
                            <th className="p-3">Tenant Config</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                          {Object.entries(data.drift.drifted_points).map(([key, val]) => (
                            <tr key={key}>
                              <td className="p-3 font-semibold text-slate-900">{key.replace('_', ' ')}</td>
                              <td className="p-3 text-slate-400">{val.default} pts</td>
                              <td className="p-3 text-rose-600 font-bold">{val.current} pts</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ORGANIZATIONAL STRUCTURE */}
          {activeTab === 'org' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Companies list */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Building2 className="w-5 h-5 text-slate-500" />
                  Registered Companies ({data.companies.length})
                </h3>

                {data.companies.length === 0 ? (
                  <p className="text-slate-400 text-xs py-4">No companies configured.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {data.companies.map((c) => (
                      <div key={c.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:shadow-md transition-all">
                        <span className="font-bold text-slate-800 text-sm block">{c.name}</span>
                        <span className={`inline-block mt-2 text-[10px] uppercase font-bold tracking-wider rounded-md px-2 py-0.5 ${
                          c.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Departments list */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Layers className="w-5 h-5 text-slate-500" />
                  Business Units / Departments ({data.business_units.length})
                </h3>

                {data.business_units.length === 0 ? (
                  <p className="text-slate-400 text-xs py-4">No business units configured.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {data.business_units.map((b) => {
                      const linkedCompany = data.companies.find(c => c.id === b.company_id)?.name;
                      return (
                        <div key={b.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:shadow-md transition-all">
                          <span className="font-bold text-slate-800 text-sm block">{b.name}</span>
                          {linkedCompany && (
                            <span className="text-[10px] text-slate-400 mt-1 block uppercase font-bold">
                              Under: {linkedCompany}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: EMPLOYEES GRID */}
          {activeTab === 'employees' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Grid Header Controls */}
              <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Employee Accounts ({filteredEmployees.length})</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Manage and impersonate staff members</p>
                </div>

                <div className="relative max-w-sm w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, email, or role..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                      <th className="p-4">Employee</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Assigned Department</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Wallet Balance</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 text-sm">
                          No matching employees found.
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const comp = data.companies.find(c => c.id === emp.primary_company_id)?.name;
                        const bu = data.business_units.find(b => b.id === emp.business_unit_id)?.name;
                        return (
                          <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-200 flex items-center justify-center font-bold text-amber-700 text-sm">
                                  {emp.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <span className="font-bold text-slate-900 block">{emp.name}</span>
                                  <span className="text-xs text-slate-400 block">{emp.email}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                emp.role === 'admin' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                emp.role === 'hr_manager' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                emp.role === 'manager' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {emp.role.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-4 text-slate-500">
                              {comp ? `${comp} / ${bu || 'None'}` : 'Not assigned'}
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                                emp.is_active ? 'text-emerald-600' : 'text-slate-400'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  emp.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                                }`} />
                                {emp.is_active ? 'Active' : 'Suspended'}
                              </span>
                            </td>
                            <td className="p-4 text-slate-900 font-extrabold">
                              {(emp.reward_points ?? 0).toFixed(1)} pts
                            </td>
                            <td className="p-4 text-right flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleImpersonate(emp.id)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold shadow-sm transition-all"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Login As
                              </button>
                              <button
                                onClick={() => handleResetPassword(emp.id, emp.name, emp.email)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 text-xs font-bold shadow-sm transition-all"
                              >
                                <Key className="w-3.5 h-3.5" />
                                Reset PW
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: ANALYTICS (TREND Sparkline) */}
          {activeTab === 'analytics' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    Engagement Trend Activity
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Logins & check-in frequency over the last 30 days</p>
                </div>
              </div>

              {/* Custom CSS/HTML Sparkline Graph */}
              <div className="h-48 flex items-end gap-1.5 pt-6 border-b border-slate-100 relative">
                {/* Horizontal guide lines */}
                <div className="absolute inset-x-0 top-6 border-t border-slate-50 text-[10px] text-slate-300 font-medium pl-1 select-none pointer-events-none">Peak activity</div>
                <div className="absolute inset-x-0 bottom-6 border-t border-slate-50 text-[10px] text-slate-300 font-medium pl-1 select-none pointer-events-none">Normal limits</div>

                {data.engagement_trend.map((day, idx) => {
                  const maxCount = Math.max(...data.engagement_trend.map(d => d.count), 1);
                  const barHeight = (day.count / maxCount) * 100;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center group relative cursor-pointer"
                      style={{ height: '100%' }}
                    >
                      {/* Tooltip on Hover */}
                      <div className="absolute bottom-full mb-2 bg-slate-900 text-white rounded-lg px-2.5 py-1.5 text-[10px] font-bold shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap pointer-events-none">
                        {day.date}: <strong className="text-amber-400">{day.count} check-ins</strong>
                      </div>
                      
                      {/* Bar fill */}
                      <div
                        className="w-full bg-gradient-to-t from-amber-400 to-orange-500 rounded-t-sm group-hover:from-amber-500 group-hover:to-orange-600 transition-all duration-300 shadow-inner"
                        style={{ height: `${Math.max(4, barHeight)}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* X-axis legends */}
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2">
                <span>{data.engagement_trend[0]?.date} (30 days ago)</span>
                <span>Active Engagement Spectrum</span>
                <span>Today</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Temporary Password Reset Modal Popup */}
      {tempPasswordReset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 border-b border-slate-100 pb-3">
              <Key className="w-6 h-6 animate-pulse" />
              <h3 className="font-extrabold text-slate-900 text-base">Temporary Password Generated</h3>
            </div>
            
            <p className="text-xs text-slate-500 leading-normal">
              A temporary password has been successfully configured for <strong>{tempPasswordReset.name}</strong> ({tempPasswordReset.email}). They will be required to update this password upon logging in.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-center flex flex-col items-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Temporary Password:</span>
              <span className="text-lg font-black text-rose-600 select-all">{tempPasswordReset.pass}</span>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setTempPasswordReset(null)}
                className="px-5 py-2 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-md"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
