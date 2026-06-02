'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Clock, PlusCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { TableSkeleton } from '@/components/SkeletonLoaders';

interface RegularizationRequest {
  id: string;
  attendance_id: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: string;
  comments: string | null;
  created_at: string;
}

export default function EmployeeRegularizationPage() {
  const [requests, setRequests] = useState<RegularizationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [attendanceId, setAttendanceId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');

  const loadRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/regularization/my');
      setRequests(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return alert('Explain details/reason for regularization request');

    try {
      setSubmitting(true);
      const reqCheckIn = checkIn ? new Date(`${checkIn}+05:30`).toISOString() : null;
      const reqCheckOut = checkOut ? new Date(`${checkOut}+05:30`).toISOString() : null;

      await api.post('/regularization/apply', {
        attendance_id: attendanceId || null,
        requested_check_in: reqCheckIn,
        requested_check_out: reqCheckOut,
        reason,
      });
      setSuccessMsg('Regularization request successfully queued for HR review!');
      setAttendanceId('');
      setCheckIn('');
      setCheckOut('');
      setReason('');
      loadRequests();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to submit correction request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black tracking-tight gradient-text">Timecard Corrections (Regularization)</h1>
        <p className="text-slate-500">Apply for corrections on missing check-in/out timestamps or device network drift exceptions.</p>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-xl text-sm font-semibold flex items-center gap-3 animate-pulse">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form panel */}
        <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm h-fit">
          <div className="flex items-center gap-2 mb-6">
            <PlusCircle className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Correct Clock-In</h2>
          </div>
          <form onSubmit={handleApply} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">ATTENDANCE LOG ID (OPTIONAL)</label>
              <input
                type="text"
                placeholder="Leave blank for missing days"
                value={attendanceId}
                onChange={(e) => setAttendanceId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">CORRECTED CHECK-IN</label>
              <input
                type="datetime-local"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">CORRECTED CHECK-OUT</label>
              <input
                type="datetime-local"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">JUSTIFICATION / REASON</label>
              <textarea
                rows={3}
                placeholder="State why correction is required (e.g. client location drift, network outage)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn btn-primary py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm transition-all"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>

        {/* History table */}
        <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">Correction Audits</h2>
            </div>
            <button onClick={loadRequests} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <TableSkeleton cols={4} rows={5} />
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No correction logs registered yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Corrected Timestamps</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">HR Comments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-medium">
                  {requests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4 text-xs font-bold text-slate-800 space-y-1">
                          <div>In: {r.requested_check_in ? formatDateTime(r.requested_check_in) : 'N/A'}</div>
                          <div>Out: {r.requested_check_out ? formatDateTime(r.requested_check_out) : 'N/A'}</div>
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {r.reason}
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
                        {r.comments || 'No feedback'}
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
