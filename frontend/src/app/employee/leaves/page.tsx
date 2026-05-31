'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Calendar, PlusCircle, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface LeaveBalance {
  id: string;
  leave_type: string;
  allocated: number;
  used: number;
  pending_approval: number;
}

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  comments: string | null;
  created_at: string;
}

export default function EmployeeLeavesPage() {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Leave Form State
  const [leaveType, setLeaveType] = useState('sick');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [balRes, reqRes] = await Promise.all([
        api.get('/leaves/balances'),
        api.get('/leaves/history'),
      ]);
      setBalances(balRes.data);
      setRequests(reqRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason) {
      return alert('Please fill in all fields');
    }

    try {
      setSubmitting(true);
      await api.post('/leaves/apply', {
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason,
      });
      setSuccessMsg('Leave application submitted successfully for review!');
      setStartDate('');
      setEndDate('');
      setReason('');
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black tracking-tight gradient-text">Leaves & Paid Time Off</h1>
        <p className="text-slate-500">Monitor leave balances, view history, or file a time-off application request.</p>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-xl text-sm font-semibold flex items-center gap-3 animate-pulse">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid of Leave Balances */}
      {loading ? (
        <div className="flex justify-center items-center py-6">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {balances.map((b) => (
            <div key={b.id} className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {b.leave_type.replace('_', ' ')}
              </span>
              <div className="flex justify-between items-baseline">
                <span className="text-3xl font-black text-slate-900">
                  {b.allocated - b.used} <span className="text-xs text-slate-400 font-bold">days left</span>
                </span>
                <span className="text-xs text-slate-500 font-bold">Allocated: {b.allocated}</span>
              </div>
              <div className="mt-4 w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                <div
                  className="bg-indigo-600 h-full"
                  style={{ width: `${(b.used / b.allocated) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2">
                <span>Used: {b.used} days</span>
                <span>Pending: {b.pending_approval} days</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form: Apply leave */}
        <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm lg:col-span-1 h-fit">
          <div className="flex items-center gap-2 mb-6">
            <PlusCircle className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Apply for Leave</h2>
          </div>
          <form onSubmit={handleApply} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">LEAVE TYPE</label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="sick">Sick Leave</option>
                <option value="casual">Casual Leave</option>
                <option value="earned">Earned Leave</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">START DATE</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">END DATE</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">REASON</label>
              <textarea
                rows={3}
                placeholder="Explain the reason for time-off request..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn btn-primary py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm transition-all"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </form>
        </div>

        {/* History Table */}
        <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">Leave History Logs</h2>
            </div>
            <button onClick={loadData} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No leave requests registered. Apply using the form to start.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Leave Type</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-medium">
                  {requests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4 capitalize font-bold text-slate-800">
                        {r.leave_type.replace('_', ' ')}
                      </td>
                      <td className="py-4 px-4 text-slate-500 text-xs">
                        {formatDate(r.start_date)} to {formatDate(r.end_date)}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          r.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          r.status === 'verified' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-450 italic max-w-xs truncate">
                        {r.comments || 'No feedback yet'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
