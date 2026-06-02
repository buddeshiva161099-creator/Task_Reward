'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Company } from '@/types';
import { cn, formatDate } from '@/lib/utils';
import {
  Building2, Plus, Search, X, Power, PowerOff, FileText, Calendar, Clock, Loader2, Save, Shield, MapPin, Timer
} from 'lucide-react';
import { CardSkeleton } from '@/components/SkeletonLoaders';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', description: '' });
  const [error, setError] = useState('');

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await api.get('/companies/all');
      setCompanies(res.data);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api.post('/companies', newCompany);
      setShowCreateModal(false);
      setNewCompany({ name: '', description: '' });
      fetchCompanies();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create company');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setSaving(true);
    try {
      await api.put(`/companies/${editingCompany.id}`, {
        name: editingCompany.name,
        description: editingCompany.description,
        work_days: editingCompany.work_days,
        work_start_time: editingCompany.work_start_time,
        work_end_time: editingCompany.work_end_time,
        office_lat: editingCompany.office_lat,
        office_lng: editingCompany.office_lng,
        geofence_radius_meters: editingCompany.geofence_radius_meters,
        geofence_policy: editingCompany.geofence_policy,
        min_session_minutes: editingCompany.min_session_minutes,
        auto_checkout_enabled: editingCompany.auto_checkout_enabled,
        location_drift_threshold_km: editingCompany.location_drift_threshold_km,
      });
      setShowEditModal(false);
      fetchCompanies();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update company');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (company: Company) => {
    try {
      if (company.is_active) {
        await api.delete(`/companies/${company.id}`);
      } else {
        await api.put(`/companies/${company.id}`, { is_active: true });
      }
      fetchCompanies();
    } catch (err) {
      console.error('Failed to update company:', err);
    }
  };

  const toggleDay = (day: string) => {
    if (!editingCompany) return;
    const current = editingCompany.work_days || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    setEditingCompany({ ...editingCompany, work_days: updated });
  };

  const filtered = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage tenant settings and working schedules</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" />
          Add Company
        </button>
      </div>

      {/* Search */}
      <div className="glass rounded-xl p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
            placeholder="Search companies..."
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((company) => (
          <div key={company.id} className="glass rounded-xl p-6 border border-border flex flex-col h-full shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center shrink-0 shadow-sm">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${company.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                {company.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <h3 className="font-bold text-xl mb-1">{company.name}</h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{company.description || 'No description provided.'}</p>
            
            <div className="space-y-3 mt-auto">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 p-2 rounded-lg">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>{company.work_days?.length || 0} active workdays</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 p-2 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>{company.work_start_time} - {company.work_end_time}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-6 pt-4 border-t border-border">
              <button
                onClick={() => {
                  setEditingCompany(company);
                  setShowEditModal(true);
                }}
                className="btn btn-secondary text-xs flex-1"
              >
                Settings
              </button>
              <button
                onClick={() => handleToggleActive(company)}
                className={`btn text-xs px-3 ${company.is_active ? 'btn-danger' : 'btn-secondary'}`}
              >
                {company.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingCompany && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Company Profile</h2>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-0.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    Organization Settings
                  </p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="w-12 h-12 rounded-2xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600 border border-transparent hover:border-slate-200">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Basic Information</h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Company Name</label>
                    <input
                      type="text"
                      value={editingCompany.name}
                      onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                      className="input h-12"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Description</label>
                    <textarea
                      value={editingCompany.description || ''}
                      onChange={(e) => setEditingCompany({ ...editingCompany, description: e.target.value })}
                      className="input min-h-24 py-3"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Work Type</label>
                      <select
                        value={editingCompany.work_type || 'fixed'}
                        onChange={(e) => setEditingCompany({ ...editingCompany, work_type: e.target.value })}
                        className="select h-12"
                      >
                        <option value="fixed">Fixed Hours</option>
                        <option value="flexible">Flexible</option>
                        <option value="remote">Remote</option>
                      </select>
                    </div>
                    {editingCompany.work_type === 'flexible' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Flexible Hrs</label>
                        <input
                          type="number"
                          value={editingCompany.flexible_hours || 8}
                          onChange={(e) => setEditingCompany({ ...editingCompany, flexible_hours: parseInt(e.target.value) })}
                          className="input h-12"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Operational Hours</h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Working Days</label>
                    <div className="flex flex-wrap gap-2">
                      {daysOfWeek.map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                            editingCompany.work_days?.includes(day)
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100"
                              : "bg-white border-slate-200 text-slate-400 hover:border-indigo-300"
                          )}
                        >
                          {day.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Start Time</label>
                      <div className="relative">
                        <input
                          type="time"
                          value={editingCompany.work_start_time}
                          onChange={(e) => setEditingCompany({ ...editingCompany, work_start_time: e.target.value })}
                          className="input h-12 font-bold pr-10"
                        />
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">End Time</label>
                      <div className="relative">
                        <input
                          type="time"
                          value={editingCompany.work_end_time}
                          onChange={(e) => setEditingCompany({ ...editingCompany, work_end_time: e.target.value })}
                          className="input h-12 font-bold pr-10"
                        />
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cut-out Time (Grace)</label>
                    <div className="relative">
                      <input
                        type="time"
                        value={editingCompany.cut_out_time || '10:00'}
                        onChange={(e) => setEditingCompany({ ...editingCompany, cut_out_time: e.target.value })}
                        className="input h-12 font-bold text-rose-500 pr-10"
                      />
                      <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Geofence & Smart Attendance Settings */}
              <div className="col-span-full space-y-5 pt-6 border-t border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
                    <Shield className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Smart Attendance & Geofencing</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Anti-manipulation controls</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Geofence Policy */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Geofence Policy</label>
                    <select
                      value={editingCompany.geofence_policy || 'flexible'}
                      onChange={(e) => setEditingCompany({ ...editingCompany, geofence_policy: e.target.value })}
                      className="select h-12"
                    >
                      <option value="disabled">Disabled — No location check</option>
                      <option value="flexible">Flexible — Flag if outside zone</option>
                      <option value="strict">Strict — Block check-in outside zone</option>
                    </select>
                  </div>

                  {/* Geofence Radius */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Geofence Radius (meters)</label>
                    <input
                      type="number"
                      min="50"
                      max="10000"
                      value={editingCompany.geofence_radius_meters || 500}
                      onChange={(e) => setEditingCompany({ ...editingCompany, geofence_radius_meters: parseInt(e.target.value) })}
                      className="input h-12"
                    />
                  </div>

                  {/* Office Latitude */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                      <MapPin className="w-3 h-3" /> Office Latitude
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={editingCompany.office_lat ?? ''}
                      onChange={(e) => setEditingCompany({ ...editingCompany, office_lat: e.target.value ? parseFloat(e.target.value) : null })}
                      className="input h-12 font-mono"
                      placeholder="e.g. 28.6139"
                    />
                  </div>

                  {/* Office Longitude */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                      <MapPin className="w-3 h-3" /> Office Longitude
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={editingCompany.office_lng ?? ''}
                      onChange={(e) => setEditingCompany({ ...editingCompany, office_lng: e.target.value ? parseFloat(e.target.value) : null })}
                      className="input h-12 font-mono"
                      placeholder="e.g. 77.2090"
                    />
                  </div>

                  {/* Min Session Duration */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                      <Timer className="w-3 h-3" /> Min Session (minutes)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="480"
                      value={editingCompany.min_session_minutes ?? 30}
                      onChange={(e) => setEditingCompany({ ...editingCompany, min_session_minutes: parseInt(e.target.value) })}
                      className="input h-12"
                    />
                  </div>

                  {/* Drift Threshold */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Drift Threshold (km)</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={editingCompany.location_drift_threshold_km ?? 5}
                      onChange={(e) => setEditingCompany({ ...editingCompany, location_drift_threshold_km: parseFloat(e.target.value) })}
                      className="input h-12"
                    />
                  </div>
                </div>

                {/* Auto-checkout toggle */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div>
                    <p className="text-sm font-bold text-slate-700">Auto-Checkout Stale Sessions</p>
                    <p className="text-xs text-slate-400 mt-0.5">Automatically close sessions open past work hours + 1 hour</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={editingCompany.auto_checkout_enabled ?? true}
                      onChange={(e) => setEditingCompany({ ...editingCompany, auto_checkout_enabled: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary flex-1 h-14 rounded-2xl font-bold border-slate-200 text-slate-500">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1 h-14 rounded-2xl font-bold shadow-xl shadow-indigo-100 bg-indigo-600 hover:bg-indigo-700">
                  {saving ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : <><Save className="w-5 h-5" /> Save Changes</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Add Company</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">New organization</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  className="input h-12 rounded-2xl"
                  value={newCompany.name}
                  onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Description</label>
                <textarea
                  placeholder="Tell us about this company..."
                  className="input min-h-32 rounded-2xl py-4"
                  value={newCompany.description}
                  onChange={(e) => setNewCompany({ ...newCompany, description: e.target.value })}
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary flex-1 h-12 rounded-2xl font-bold border-slate-200 text-slate-500">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn btn-primary flex-1 h-12 rounded-2xl font-bold shadow-xl shadow-indigo-100 bg-indigo-600 hover:bg-indigo-700">
                  {creating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Create Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
