'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { 
  Clock, Check, X, ShieldAlert, Sparkles, ChevronRight, 
  Search, CheckCircle2, AlertCircle, UserCheck, UserX,
  PlusCircle, RefreshCw
} from 'lucide-react';

interface RegularizationRequest {
  id: string;
  user_id: string;
  user_name: string;
  attendance_id: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: string;
  comments: string | null;
  created_at: string;
  verified_by_name?: string | null;
  approved_by_name?: string | null;
}

export default function RegularizationManagementPage() {
  const { user, isAdmin, isHR, isManager, isAssistantManager } = useAuth();
  const isManagementRole = isAdmin || isHR || isManager || isAssistantManager;

  const [activeTab, setActiveTab] = useState<'team' | 'my'>('team');
  const [requests, setRequests] = useState<RegularizationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [commentsMap, setCommentsMap] = useState<Record<string, string>>({});
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // My Corrections State
  const [myRequests, setMyRequests] = useState<RegularizationRequest[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [attendanceId, setAttendanceId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await api.get('/regularization/all');
      setRequests(response.data);
    } catch (err) {
      console.error('Failed to fetch regularizations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRequests = async () => {
    try {
      setMyLoading(true);
      const res = await api.get('/regularization/history');
      setMyRequests(res.data);
    } catch (err) {
      console.error('Failed to fetch personal corrections:', err);
    } finally {
      setMyLoading(false);
    }
  };

  useEffect(() => {
    if (isManagementRole) {
      if (activeTab === 'team') {
        fetchRequests();
      } else {
        fetchMyRequests();
      }
    }
  }, [isManagementRole, activeTab]);

  const handleVerify = async (id: string) => {
    try {
      const comments = commentsMap[id] || '';
      await api.post(`/regularization/verify/${id}`, { comments });
      setFeedbackMessage('Request verified successfully! Awaiting final review.');
      setCommentsMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchRequests();
    } catch (err) {
      console.error(err);
      alert('Verification failed');
    }
  };

  const handleReview = async (id: string) => {
    try {
      const comments = commentsMap[id] || '';
      await api.post(`/regularization/review/${id}`, { comments });
      setFeedbackMessage('Request reviewed and escalated to Admin for final approval.');
      setCommentsMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchRequests();
    } catch (err) {
      console.error(err);
      alert('Review failed');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const comments = commentsMap[id] || '';
      await api.post(`/regularization/approve/${id}`, { comments });
      setFeedbackMessage('Attendance regularized successfully! Time log updated and locked.');
      setCommentsMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchRequests();
    } catch (err) {
      console.error(err);
      alert('Approval failed');
    }
  };

  const handleReject = async (id: string) => {
    try {
      const comments = commentsMap[id] || '';
      await api.post(`/regularization/reject/${id}`, { comments });
      setFeedbackMessage('Request rejected successfully.');
      setCommentsMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchRequests();
    } catch (err) {
      console.error(err);
      alert('Rejection failed');
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return alert('Explain details/reason for regularization request');

    try {
      setSubmitting(true);
      await api.post('/regularization/apply', {
        attendance_id: attendanceId || null,
        requested_check_in: checkIn || null,
        requested_check_out: checkOut || null,
        reason,
      });
      setSuccessMsg('Regularization request successfully queued for HR review!');
      setAttendanceId('');
      setCheckIn('');
      setCheckOut('');
      setReason('');
      fetchMyRequests();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to submit correction request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isManagementRole) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white/40 backdrop-blur-md rounded-2xl border border-slate-200">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-black text-slate-800">Access Denied</h2>
        <p className="text-slate-500 mt-2">Only HR and Admin team members can access this console.</p>
      </div>
    );
  }

  // Dynamic counts based on retrieved requests list
  // Admin, HR Manager, and Manager have direct approval authority
  const isApprover = user?.role === 'admin' || user?.role === 'hr_manager' || user?.role === 'manager';

  const totalCount = requests.length;
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const verifiedCount = requests.filter(r => r.status === 'verified').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  // Filter requests locally based on searchQuery and statusFilter
  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.reason.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight gradient-text">Attendance Regularization Desk</h1>
          <p className="text-slate-500 mt-1">Review employee check-in/out correction requests, and submit your own corrections.</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('team')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'team'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Employees' Corrections
        </button>
        <button
          onClick={() => setActiveTab('my')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'my'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          My Corrections
        </button>
      </div>

      {activeTab === 'team' ? (
        <>
          {feedbackMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span>{feedbackMessage}</span>
              </div>
              <button 
                onClick={() => setFeedbackMessage('')} 
                className="text-emerald-500 hover:text-emerald-700 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Quick Search & Premium Pills Filter Section */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-slate-150 shadow-sm">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by employee or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-650 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Premium Pills Filter */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All Requests', count: totalCount },
                { id: 'pending', label: 'Pending', count: pendingCount },
                { id: 'verified', label: 'Verified', count: verifiedCount },
                { id: 'approved', label: 'Approved', count: approvedCount },
                { id: 'rejected', label: 'Rejected', count: rejectedCount },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border flex items-center gap-2 ${
                    statusFilter === tab.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 scale-102'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] ${
                      statusFilter === tab.id
                        ? 'bg-white/20 text-white font-black'
                        : 'bg-slate-100 text-slate-500 font-bold'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-sm">
              <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No correction requests found matching these filters!</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredRequests.map((req) => {
                const isResolved = req.status === 'approved' || req.status === 'rejected';

                const statusBorderAccent = 
                  req.status === 'pending' ? 'border-l-4 border-l-amber-500' :
                  req.status === 'verified' ? 'border-l-4 border-l-indigo-500' :
                  req.status === 'approved' ? 'border-l-4 border-l-emerald-500' :
                  'border-l-4 border-l-rose-500';

                return (
                  <div 
                    key={req.id} 
                    className={`bg-white border border-slate-150 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col lg:flex-row justify-between gap-6 items-start lg:items-center ${statusBorderAccent}`}
                  >
                    <div className="space-y-3 flex-1 w-full">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-slate-900 text-lg">{req.user_name}</span>
                        
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider ${
                          req.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-255' :
                          req.status === 'verified' ? 'bg-indigo-50 text-indigo-700 border border-indigo-255' :
                          req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-255' :
                          'bg-rose-50 text-rose-700 border border-rose-255'
                        }`}>
                          {req.status}
                        </span>

                        {req.status !== 'pending' && req.verified_by_name && (
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200 flex items-center gap-1">
                            <Check className="w-3 h-3 text-slate-400" />
                            Verified by {req.verified_by_name}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
                        <div>
                          <span className="text-slate-400 block text-xs uppercase font-bold tracking-wider mb-1">Requested Check-In</span>
                          <span className="font-semibold text-slate-800">
                            {req.requested_check_in ? new Date(req.requested_check_in).toLocaleString() : 'No Correction'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs uppercase font-bold tracking-wider mb-1">Requested Check-Out</span>
                          <span className="font-semibold text-slate-800">
                            {req.requested_check_out ? new Date(req.requested_check_out).toLocaleString() : 'No Correction'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-sm text-slate-650 bg-slate-50/50 p-3 rounded-lg border border-slate-100 italic">
                        <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                        <span>Reason: &ldquo;{req.reason}&rdquo;</span>
                      </div>

                      {isResolved && (
                        <div className="pt-2 space-y-2">
                          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                            req.status === 'approved' 
                              ? 'bg-emerald-50/30 border-emerald-100 text-emerald-800' 
                              : 'bg-rose-50/30 border-rose-100 text-rose-800'
                          }`}>
                            {req.status === 'approved' ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <div className="space-y-1">
                              <h4 className="text-xs font-black uppercase tracking-wider">
                                {req.status === 'approved' ? 'Final Attendance Regularization Approved' : 'Request Rejected'}
                              </h4>
                              <p className="text-xs font-bold text-slate-500">
                                Actioned by: <span className="text-slate-700">{req.approved_by_name || 'HR Team Member'}</span>
                              </p>
                              {req.comments && (
                                <p className="text-xs italic text-slate-600 bg-white/50 p-2.5 rounded-lg border border-slate-100 mt-2">
                                  &ldquo;{req.comments}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {!isResolved && (
                        <div className="pt-2">
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Comments / remarks</label>
                          <input
                            type="text"
                            placeholder="Add comments or administrative remarks..."
                            value={commentsMap[req.id] || ''}
                            onChange={(e) => setCommentsMap({ ...commentsMap, [req.id]: e.target.value })}
                            className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none bg-slate-50/50 hover:bg-slate-50 transition-all shadow-inner"
                          />
                        </div>
                      )}
                    </div>

                    {!isResolved && (
                      <div className="flex flex-row lg:flex-col gap-2 w-full lg:w-auto shrink-0 justify-end">
                        {req.status === 'pending' && (
                          <button
                            onClick={() => handleVerify(req.id)}
                            className="flex-1 lg:flex-initial btn text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 hover:border-indigo-300 flex items-center justify-center gap-1.5 font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm"
                          >
                            <UserCheck className="w-4 h-4 shrink-0" />
                            <span>Verify Request</span>
                          </button>
                        )}

                        {req.status === 'verified' && !isApprover && (
                          <button
                            onClick={() => handleReview(req.id)}
                            className="flex-1 lg:flex-initial btn text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 hover:border-amber-300 flex items-center justify-center gap-1.5 font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm"
                          >
                            <UserCheck className="w-4 h-4 shrink-0" />
                            <span>Reviewed &amp; Escalated</span>
                          </button>
                        )}

                        {(req.status === 'pending' || req.status === 'verified') && isApprover && (
                          <button
                            onClick={() => handleApprove(req.id)}
                            className="flex-1 lg:flex-initial btn text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 font-bold py-2.5 px-4 rounded-xl transition-all shadow-md shadow-indigo-100"
                          >
                            <Check className="w-4 h-4 shrink-0" />
                            <span>Lock & Approve</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleReject(req.id)}
                          className="flex-1 lg:flex-initial btn text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 flex items-center justify-center gap-1.5 font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm"
                        >
                          <UserX className="w-4 h-4 shrink-0" />
                          <span>Reject Request</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
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
                <button onClick={fetchMyRequests} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {myLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : myRequests.length === 0 ? (
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
                        <th className="py-3 px-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-medium">
                      {myRequests.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-4 text-xs font-bold text-slate-800 space-y-1">
                            <div>IN: {r.requested_check_in ? new Date(r.requested_check_in).toLocaleString() : 'N/A'}</div>
                            <div>OUT: {r.requested_check_out ? new Date(r.requested_check_out).toLocaleString() : 'N/A'}</div>
                          </td>
                          <td className="py-4 px-4 text-slate-600 text-xs max-w-xs truncate">
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
        </>
      )}
    </div>
  );
}
