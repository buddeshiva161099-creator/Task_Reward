'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Employee } from '@/types';
import {
  Calendar, Clock, Plus, UserPlus, FileSpreadsheet, Loader2, Sparkles,
  Shield, Check, User, ChevronRight, AlertCircle, Info, CalendarDays,
  CalendarRange, Layers
} from 'lucide-react';

interface Shift {
  id: str;
  tenant_id: str;
  name: str;
  start_time: str;
  end_time: str;
  grace_period_minutes: number;
  color_code: str;
}

interface ShiftAssignment {
  id: str;
  user_id: str;
  user_name: str;
  shift_id: str;
  shift_name: str;
  start_date: str;
  end_date: str;
}

export default function ShiftsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Shift form state
  const [shiftForm, setShiftForm] = useState({
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    grace_period_minutes: 15,
    color_code: '#3b82f6'
  });

  // Assignment form state
  const [assignForm, setAssignForm] = useState({
    user_id: '',
    shift_id: '',
    start_date: '',
    end_date: ''
  });

  const colorPresets = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#ef4444', // red
    '#06b6d4', // cyan
  ];

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empRes, shiftRes, assignRes] = await Promise.all([
        api.get('/admin/employees'),
        api.get('/shifts'),
        api.get('/shifts/assignments')
      ]);
      setEmployees(empRes.data);
      setShifts(shiftRes.data);
      setAssignments(assignRes.data);
      setError('');
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch roster configurations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftForm.name.trim()) return;

    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/shifts', shiftForm);
      setSuccess('Shift template created successfully!');
      setShiftForm({
        name: '',
        start_time: '09:00',
        end_time: '18:00',
        grace_period_minutes: 15,
        color_code: '#3b82f6'
      });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create shift.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const { user_id, shift_id, start_date, end_date } = assignForm;
    if (!user_id || !shift_id || !start_date || !end_date) {
      setError('Please fill in all assignment fields.');
      return;
    }

    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      // Parse to full ISO datetime
      const isoStart = new Date(start_date).toISOString();
      const isoEnd = new Date(end_date).toISOString();
      
      await api.post('/shifts/assign', {
        user_id,
        shift_id,
        start_date: isoStart,
        end_date: isoEnd
      });

      setSuccess('Employee roster assigned successfully!');
      setAssignForm({
        user_id: '',
        shift_id: '',
        start_date: '',
        end_date: ''
      });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to assign roster.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Shifts & Roster Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure employee shift times and assign roster schedules</p>
        </div>
      </div>

      {/* Message Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-sm text-rose-800 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-sm text-emerald-800 animate-fade-in">
          <Check className="w-5 h-5 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Control Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Create Shift Form */}
        <div className="glass rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            <h2 className="font-bold text-slate-800">Create Shift Template</h2>
          </div>
          <form onSubmit={handleCreateShift} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">Shift Name</label>
              <input
                type="text"
                value={shiftForm.name}
                onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                placeholder="e.g. Morning Shift, Night Duty"
                className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-400"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">Start Time</label>
                <input
                  type="time"
                  value={shiftForm.start_time}
                  onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                  className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">End Time</label>
                <input
                  type="time"
                  value={shiftForm.end_time}
                  onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                  className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">Grace Period (Minutes)</label>
              <input
                type="number"
                value={shiftForm.grace_period_minutes}
                onChange={(e) => setShiftForm({ ...shiftForm, grace_period_minutes: parseInt(e.target.value) || 0 })}
                min="0"
                max="60"
                className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">Color Code Tag</label>
              <div className="flex gap-2.5 mt-1">
                {colorPresets.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setShiftForm({ ...shiftForm, color_code: color })}
                    style={{ backgroundColor: color }}
                    className={`w-8 h-8 rounded-full border-2 transition-transform scale-100 hover:scale-110 shrink-0 ${
                      shiftForm.color_code === color ? 'border-slate-800 ring-2 ring-slate-200' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={actionLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Save Shift Template</span>
            </button>
          </form>
        </div>

        {/* Assign Roster Form */}
        <div className="glass rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="w-5 h-5 text-emerald-500" />
            <h2 className="font-bold text-slate-800">Assign Shift Roster</h2>
          </div>
          <form onSubmit={handleAssignShift} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">Select Employee</label>
              <select
                value={assignForm.user_id}
                onChange={(e) => setAssignForm({ ...assignForm, user_id: e.target.value })}
                className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                required
              >
                <option value="">-- Choose Employee --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.role.replace('_', ' ')})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">Select Shift Template</label>
              <select
                value={assignForm.shift_id}
                onChange={(e) => setAssignForm({ ...assignForm, shift_id: e.target.value })}
                className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                required
              >
                <option value="">-- Choose Shift Template --</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">Start Date</label>
                <input
                  type="date"
                  value={assignForm.start_date}
                  onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })}
                  className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5 ml-1">End Date</label>
                <input
                  type="date"
                  value={assignForm.end_date}
                  onChange={(e) => setAssignForm({ ...assignForm, end_date: e.target.value })}
                  className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white border border-slate-200/80 rounded-xl px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={actionLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3.5 text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              <span>Schedule Roster Range</span>
            </button>
          </form>
        </div>
      </div>

      {/* Active Shift Templates Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-500" />
          <h2 className="font-bold text-slate-800">Active Shift Configurations</h2>
        </div>
        {shifts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            No shift templates created yet. Use the form above to add shift schedules.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {shifts.map((s) => (
              <div
                key={s.id}
                className="glass border border-slate-100 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden"
              >
                {/* Accent Tag */}
                <div style={{ backgroundColor: s.color_code }} className="absolute left-0 top-0 bottom-0 w-2" />
                
                <h3 className="font-bold text-slate-800 pl-2">{s.name}</h3>
                <div className="pl-2 space-y-1.5 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-slate-700">{s.start_time} - {s.end_time}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                    <span>Grace Period: <strong className="text-slate-700">{s.grace_period_minutes} mins</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignments History Roster Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-indigo-500" />
          <h2 className="font-bold text-slate-800">Active Roster assignments</h2>
        </div>
        {assignments.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            No employee rosters assigned yet. Select an employee and shift template to schedule.
          </div>
        ) : (
          <div className="glass rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-55 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="p-4 pl-6">Employee</th>
                    <th className="p-4">Assigned Shift</th>
                    <th className="p-4">Start Date</th>
                    <th className="p-4">End Date</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {assignments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-500">
                          {a.user_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-bold text-slate-800">{a.user_name}</span>
                      </td>
                      <td className="p-4">
                        <span className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">
                          {a.shift_name}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs">{formatDateLabel(a.start_date)}</td>
                      <td className="p-4 font-mono text-xs">{formatDateLabel(a.end_date)}</td>
                      <td className="p-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Active Roster
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
