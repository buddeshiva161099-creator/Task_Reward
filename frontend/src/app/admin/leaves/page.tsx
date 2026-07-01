'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { 
  Calendar, Check, X, ShieldAlert, Sparkles, ChevronRight, 
  Search, CheckCircle2, AlertCircle, CalendarDays, UserCheck, UserX,
  PlusCircle, RefreshCw, Download, Loader2
} from 'lucide-react';
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoaders';

interface LeaveRequest {
  id: string;
  user_id: string;
  user_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  comments: string | null;
  created_at: string;
  verified_by_name?: string | null;
  approved_by_name?: string | null;
}

interface LeaveBalance {
  id: string;
  leave_type: string;
  allocated: number;
  used: number;
  pending_approval: number;
}

const getInitials = (name: string) => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const getAvatarColorClass = (name: string) => {
  if (!name) return 'bg-slate-200 text-slate-700';
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colors = [
    'bg-gradient-to-tr from-indigo-500 to-purple-500 text-white',
    'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white',
    'bg-gradient-to-tr from-blue-500 to-indigo-500 text-white',
    'bg-gradient-to-tr from-pink-500 to-rose-500 text-white',
    'bg-gradient-to-tr from-amber-500 to-orange-500 text-white',
    'bg-gradient-to-tr from-violet-500 to-fuchsia-500 text-white'
  ];
  return colors[hash % colors.length];
};

const getOverlappingLeaves = (currentReq: LeaveRequest, allReqs: LeaveRequest[]) => {
  const currentStart = new Date(currentReq.start_date).getTime();
  const currentEnd = new Date(currentReq.end_date).getTime();

  return allReqs.filter((other) => {
    if (
      other.id === currentReq.id ||
      other.user_id === currentReq.user_id ||
      !(other.status === 'approved' || other.status === 'verified')
    ) {
      return false;
    }
    const otherStart = new Date(other.start_date).getTime();
    const otherEnd = new Date(other.end_date).getTime();

    // Check overlap
    return otherStart <= currentEnd && otherEnd >= currentStart;
  });
};

const isTodayWithinRange = (startDateStr: string, endDateStr: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDateStr);
  end.setHours(0, 0, 0, 0);
  return today.getTime() >= start.getTime() && today.getTime() <= end.getTime();
};

const isCurrentMonth = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

export default function LeavesManagementPage() {
  const { user, isAdmin, isHR, isManager, isAssistantManager } = useAuth();
  const isManagementRole = isAdmin || isHR || isManager || isAssistantManager;

  const [activeTab, setActiveTab] = useState<'team' | 'my'>('team');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [commentsMap, setCommentsMap] = useState<Record<string, string>>({});
  
  // New hooks for upgrades
  const [employees, setEmployees] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentCalDate, setCurrentCalDate] = useState(new Date());
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [bulkComments, setBulkComments] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // My Leaves State
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Leave Form State
  const [leaveType, setLeaveType] = useState('sick');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      const response = await api.get('/leaves/all');
      setRequests(response.data);
    } catch (err) {
      console.error('Failed to fetch all leaves:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/employees');
      setEmployees(response.data);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    }
  };

  const fetchMyLeaves = async () => {
    try {
      setMyLoading(true);
      const [balRes, reqRes] = await Promise.all([
        api.get('/leaves/balances'),
        api.get('/leaves/history'),
      ]);
      setBalances(balRes.data);
      setMyRequests(reqRes.data);
    } catch (err) {
      console.error('Failed to fetch personal leaves:', err);
    } finally {
      setMyLoading(false);
    }
  };

  useEffect(() => {
    if (isManagementRole) {
      if (activeTab === 'team') {
        fetchLeaves();
        fetchEmployees();
      } else {
        fetchMyLeaves();
      }
    }
  }, [isManagementRole, activeTab]);

  const handleVerify = async (leaveId: string) => {
    try {
      const comments = commentsMap[leaveId] || '';
      await api.post(`/leaves/verify/${leaveId}`, { comments });
      setFeedbackMessage('Leave request successfully verified. Awaiting manager approval!');
      setCommentsMap(prev => {
        const next = { ...prev };
        delete next[leaveId];
        return next;
      });
      fetchLeaves();
    } catch (err) {
      console.error(err);
      alert('Verification failed.');
    }
  };

  const handleApprove = async (leaveId: string) => {
    try {
      const comments = commentsMap[leaveId] || '';
      await api.post(`/leaves/approve/${leaveId}`, { comments });
      setFeedbackMessage('Leave request approved and balance updated successfully!');
      setCommentsMap(prev => {
        const next = { ...prev };
        delete next[leaveId];
        return next;
      });
      fetchLeaves();
    } catch (err) {
      console.error(err);
      alert('Approval failed.');
    }
  };

  const handleReject = async (leaveId: string) => {
    try {
      const comments = commentsMap[leaveId] || '';
      await api.post(`/leaves/reject/${leaveId}`, { comments });
      setFeedbackMessage('Leave request rejected successfully.');
      setCommentsMap(prev => {
        const next = { ...prev };
        delete next[leaveId];
        return next;
      });
      fetchLeaves();
    } catch (err) {
      console.error(err);
      alert('Rejection failed.');
    }
  };

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
      fetchMyLeaves();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCSV = () => {
    // Columns to export
    const headers = [
      'Employee Name',
      'Leave Type',
      'Start Date',
      'End Date',
      'Duration (Days)',
      'Reason',
      'Status',
      'Verified By',
      'Approved By',
      'Comments'
    ];

    // Map filtered requests to CSV rows
    const rows = filteredRequests.map(req => {
      const startDate = new Date(req.start_date);
      const endDate = new Date(req.end_date);
      const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      return [
        req.user_name,
        req.leave_type.replace('_', ' ').toUpperCase(),
        req.start_date.split('T')[0],
        req.end_date.split('T')[0],
        durationDays.toString(),
        // Escape double quotes in reason
        req.reason.replace(/"/g, '""'),
        req.status.toUpperCase(),
        req.verified_by_name || 'N/A',
        req.approved_by_name || 'N/A',
        (req.comments || '').replace(/"/g, '""')
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${val}"`).join(','))
    ].join('\n');

    // Create a download link and click it
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Leave_Requests_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkAction = async (actionType: 'approve' | 'verify' | 'reject') => {
    try {
      setBulkLoading(true);
      setFeedbackMessage('');
      
      let processedCount = 0;
      for (const leaveId of selectedRequestIds) {
        const req = requests.find(r => r.id === leaveId);
        if (!req) continue;

        if (actionType === 'verify' && req.status !== 'pending') continue;
        if (actionType === 'approve' && !isApprover) continue;

        const endpoint = `/leaves/${actionType}/${leaveId}`;
        await api.post(endpoint, { comments: bulkComments });
        processedCount++;
      }

      setFeedbackMessage(`Bulk action '${actionType}' completed successfully for ${processedCount} requests!`);
      setSelectedRequestIds([]);
      setBulkComments('');
      fetchLeaves();
    } catch (err) {
      console.error(err);
      alert(`Bulk action '${actionType}' failed.`);
    } finally {
      setBulkLoading(false);
    }
  };

  const checkStaffingCapacity = (req: LeaveRequest, allReqs: LeaveRequest[], allEmps: any[]) => {
    const reqEmp = allEmps.find(e => e.id === req.user_id);
    if (!reqEmp || !reqEmp.business_unit_id) return null;

    const buId = reqEmp.business_unit_id;
    const buEmps = allEmps.filter(e => e.business_unit_id === buId);
    const totalHeadcount = buEmps.length;
    if (totalHeadcount <= 1) return null;

    const start = new Date(req.start_date);
    const end = new Date(req.end_date);
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    let maxOverlapCount = 0;
    let criticalDateStr = '';

    for (let t = start.getTime(); t <= end.getTime(); t += oneDayMs) {
      const currentDay = new Date(t);
      currentDay.setHours(0, 0, 0, 0);

      const activeLeavesOnDay = allReqs.filter(other => {
        if (
          other.id === req.id ||
          other.user_id === req.user_id ||
          other.status !== 'approved'
        ) {
          return false;
        }
        const otherEmp = allEmps.find(e => e.id === other.user_id);
        if (!otherEmp || otherEmp.business_unit_id !== buId) return false;

        const oStart = new Date(other.start_date);
        oStart.setHours(0, 0, 0, 0);
        const oEnd = new Date(other.end_date);
        oEnd.setHours(0, 0, 0, 0);

        return currentDay.getTime() >= oStart.getTime() && currentDay.getTime() <= oEnd.getTime();
      });

      if (activeLeavesOnDay.length > maxOverlapCount) {
        maxOverlapCount = activeLeavesOnDay.length;
        criticalDateStr = currentDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      }
    }

    const activeHeadcount = totalHeadcount - (maxOverlapCount + 1);
    const activePercentage = activeHeadcount / totalHeadcount;

    if (activePercentage < 0.6) {
      const roundedPercent = Math.round(activePercentage * 100);
      return {
        percentage: roundedPercent,
        activeCount: activeHeadcount,
        totalCount: totalHeadcount,
        criticalDate: criticalDateStr || start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        maxOverlap: maxOverlapCount
      };
    }

    return null;
  };

  if (!isManagementRole) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white/40 backdrop-blur-md rounded-2xl border border-slate-200">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-black text-slate-800">Access Denied</h2>
        <p className="text-slate-500 mt-2">Only management team members can access this console.</p>
      </div>
    );
  }

  // Admin, HR Manager, and Manager all have final approval authority
  const isApprover = user?.role === 'admin' || user?.role === 'hr_manager' || user?.role === 'manager';

  // Dynamic counts based on retrieved requests list
  const totalCount = requests.length;
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const verifiedCount = requests.filter(r => r.status === 'verified').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  // Filter requests locally based on searchQuery and statusFilter
  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.leave_type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const pendingApprovalsCount = requests.filter(r => r.status === 'pending' || r.status === 'verified').length;
  const approvedLeavesThisMonth = requests.filter(r => r.status === 'approved' && isCurrentMonth(r.start_date)).length;
  const outOfOfficeTodayList = requests.filter(r => r.status === 'approved' && isTodayWithinRange(r.start_date, r.end_date));
  const outOfOfficeTodayCount = outOfOfficeTodayList.length;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight gradient-text">Leave Management Portal</h1>
          <p className="text-slate-500 mt-1">Verify, approve, or reject employee leave and shift request pipelines, and manage your own leaves.</p>
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
          Employees' Leave Requests
        </button>
        <button
          onClick={() => setActiveTab('my')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'my'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          My Leave Requests
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

          {/* Dashboard Summary Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Card 1: Pending Action */}
            <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-650 flex items-center justify-center font-bold text-lg group-hover:scale-105 transition-transform">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-450 tracking-wider block">Requires Review</span>
                <span className="text-2xl font-black text-slate-800">{pendingApprovalsCount}</span>
                <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Pending verification/approval</span>
              </div>
            </div>

            {/* Card 2: Approved This Month */}
            <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 text-emerald-650 flex items-center justify-center font-bold text-lg group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-450 tracking-wider block">Leaves This Month</span>
                <span className="text-2xl font-black text-slate-800">{approvedLeavesThisMonth}</span>
                <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Approved in {new Date().toLocaleString('default', { month: 'long' })}</span>
              </div>
            </div>

            {/* Card 3: Out Of Office Today */}
            <div className="bg-gradient-to-br from-rose-50 to-white border border-rose-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-2xl bg-rose-600/10 text-rose-650 flex items-center justify-center font-bold text-lg group-hover:scale-105 transition-transform">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-black uppercase text-slate-450 tracking-wider block">Out Of Office Today</span>
                <span className="text-2xl font-black text-slate-800">{outOfOfficeTodayCount}</span>
                {outOfOfficeTodayCount > 0 ? (
                  <div className="flex items-center gap-1 mt-1 overflow-hidden">
                    {outOfOfficeTodayList.slice(0, 3).map((ooo) => (
                      <div 
                        key={ooo.id}
                        className={`w-5 h-5 rounded-md ${getAvatarColorClass(ooo.user_name)} text-[8px] font-black flex items-center justify-center uppercase shrink-0 border border-white shadow-sm`}
                        title={ooo.user_name}
                      >
                        {getInitials(ooo.user_name)}
                      </div>
                    ))}
                    {outOfOfficeTodayCount > 3 && (
                      <span className="text-[9px] text-slate-400 font-bold">+{outOfOfficeTodayCount - 3} more</span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 font-bold block mt-0.5">All team members active</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Search & Premium Pills Filter Section */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-slate-150 shadow-sm">
            {/* Search Bar & Export Button Group */}
            <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-xl items-stretch sm:items-center">
              <div className="relative flex-1">
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

              <button
                onClick={handleExportCSV}
                className="btn btn-secondary flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold shadow-sm bg-white border border-slate-200 text-slate-650 hover:bg-slate-50 hover:border-slate-300 transition-all hover:scale-102"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Report</span>
              </button>

              {/* View Switcher Toggle */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50 h-10 shrink-0">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'list' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'calendar' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-750'
                  }`}
                >
                  Calendar
                </button>
              </div>
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
            <TableSkeleton cols={5} rows={8} />
          ) : viewMode === 'calendar' ? (
            <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm animate-fade-in">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-indigo-650" />
                  <span>{currentCalDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                </h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setCurrentCalDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                  >
                    &larr; Prev
                  </button>
                  <button 
                    onClick={() => setCurrentCalDate(new Date())}
                    className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black transition-colors"
                  >
                    Today
                  </button>
                  <button 
                    onClick={() => setCurrentCalDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                  >
                    Next &rarr;
                  </button>
                </div>
              </div>

              {/* Grid Calendar */}
              <div className="grid grid-cols-7 gap-2">
                {/* Week headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center font-black uppercase text-[10px] text-slate-450 tracking-wider py-2">
                    {day}
                  </div>
                ))}

                {/* Day cells */}
                {(() => {
                  const year = currentCalDate.getFullYear();
                  const month = currentCalDate.getMonth();
                  const firstDayIndex = new Date(year, month, 1).getDay();
                  const totalDays = new Date(year, month + 1, 0).getDate();

                  const cells = [];
                  // Offset days
                  for (let i = 0; i < firstDayIndex; i++) {
                    cells.push(<div key={`empty-${i}`} className="bg-slate-50/20 border border-slate-100/50 rounded-2xl min-h-[90px] p-2 opacity-50" />);
                  }

                  // Active month days
                  for (let d = 1; d <= totalDays; d++) {
                    const dayDate = new Date(year, month, d);
                    dayDate.setHours(0, 0, 0, 0);

                    // Filter approved/verified leaves on this day
                    const activeLeavesOnDay = requests.filter(r => {
                      if (!(r.status === 'approved' || r.status === 'verified')) return false;
                      const s = new Date(r.start_date);
                      s.setHours(0, 0, 0, 0);
                      const e = new Date(r.end_date);
                      e.setHours(0, 0, 0, 0);
                      return dayDate.getTime() >= s.getTime() && dayDate.getTime() <= e.getTime();
                    });

                    const isToday = new Date().toDateString() === dayDate.toDateString();

                    cells.push(
                      <div 
                        key={`day-${d}`} 
                        className={`border rounded-2xl min-h-[95px] p-2.5 transition-all hover:bg-slate-50/50 flex flex-col justify-between ${
                          isToday 
                            ? 'bg-indigo-50/20 border-indigo-250 ring-1 ring-indigo-100 shadow-sm' 
                            : 'bg-white border-slate-150 shadow-inner'
                        }`}
                      >
                        <span className={`text-[10px] font-black w-5.5 h-5.5 flex items-center justify-center rounded-full leading-none shrink-0 ${
                          isToday ? 'bg-indigo-650 text-white shadow-sm' : 'text-slate-550'
                        }`}>
                          {d}
                        </span>

                        <div className="space-y-1 mt-1.5 flex-1 overflow-y-auto max-h-[65px] custom-scrollbar">
                          {activeLeavesOnDay.map(l => (
                            <button
                              key={l.id}
                              onClick={() => { setProfileModalUserId(l.user_id); setProfileModalUserName(l.user_name); }}
                              className={`w-full text-left truncate px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border transition-all hover:scale-102 hover:shadow-sm flex items-center justify-between gap-1 ${
                                l.leave_type === 'sick' 
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                                  : l.leave_type === 'casual' 
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-100'
                                  : 'bg-pink-50 text-pink-850 border-pink-100'
                              }`}
                              title={`${l.user_name} (${l.leave_type})`}
                            >
                              <span className="truncate">{l.user_name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-sm">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No leave requests found matching these filters!</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredRequests.map((req) => {
                const startDate = new Date(req.start_date);
                const endDate = new Date(req.end_date);
                const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const isResolved = req.status === 'approved' || req.status === 'rejected';
                const capacityWarning = checkStaffingCapacity(req, requests, employees);

                const statusBorderAccent = 
                  req.status === 'pending' ? 'border-l-4 border-l-amber-500' :
                  req.status === 'verified' ? 'border-l-4 border-l-indigo-500' :
                  req.status === 'approved' ? 'border-l-4 border-l-emerald-500' :
                  'border-l-4 border-l-rose-500';

                return (
                  <div 
                    key={req.id} 
                    className={`bg-white border border-slate-150 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col lg:flex-row justify-between gap-6 items-start lg:items-center ${statusBorderAccent}`}
                  >
                    <div className="space-y-4 flex-1 w-full">
                      {/* Card Header with Avatar and Badges */}
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3.5">
                          {!isResolved && (
                            <input 
                              type="checkbox" 
                              checked={selectedRequestIds.includes(req.id)}
                              onChange={() => {
                                setSelectedRequestIds(prev => 
                                  prev.includes(req.id) ? prev.filter(id => id !== req.id) : [...prev, req.id]
                                );
                              }}
                              className="w-4 h-4 rounded text-indigo-650 border-slate-350 focus:ring-indigo-500 shrink-0 cursor-pointer"
                            />
                          )}
                          <button
                            onClick={() => { setProfileModalUserId(req.user_id); setProfileModalUserName(req.user_name); }}
                            className={`w-12 h-12 rounded-2xl ${getAvatarColorClass(req.user_name)} flex items-center justify-center font-black text-sm tracking-wider shadow-md shadow-indigo-100 uppercase shrink-0 hover:scale-105 transition-transform`}
                          >
                            {getInitials(req.user_name)}
                          </button>
                          <div>
                            <button
                              onClick={() => { setProfileModalUserId(req.user_id); setProfileModalUserName(req.user_name); }}
                              className="font-bold text-slate-800 text-base leading-snug hover:text-indigo-655 transition-colors text-left"
                            >
                              {req.user_name}
                            </button>
                            <p className="text-[10px] font-black uppercase text-indigo-650 tracking-wider mt-0.5">Employee</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-slate-50 text-slate-655 uppercase tracking-wide border border-slate-200/60 shadow-sm">
                            {req.leave_type.replace('_', ' ')}
                          </span>
                          
                          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm ${
                            req.status === 'pending' ? 'bg-amber-100 text-amber-850 border border-amber-200' :
                            req.status === 'verified' ? 'bg-indigo-100 text-indigo-850 border border-indigo-200' :
                            req.status === 'approved' ? 'bg-emerald-100 text-emerald-850 border border-emerald-200' :
                            'bg-rose-100 text-rose-850 border border-rose-200'
                          }`}>
                            {req.status}
                          </span>

                          {req.status !== 'pending' && req.verified_by_name && (
                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-indigo-50/50 text-indigo-700 border border-indigo-100 flex items-center gap-1 shadow-sm">
                              <CheckCircle2 className="w-3 h-3 text-indigo-500" />
                              Verified by {req.verified_by_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Date Range Block */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3 text-xs font-bold text-slate-500 w-fit shadow-inner">
                        <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="text-slate-700">{formatDate(req.start_date)}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-350" />
                        <span className="text-slate-700">{formatDate(req.end_date)}</span>
                        <span className="ml-1 px-2 py-0.5 bg-indigo-650 text-white rounded-lg font-black text-[9px] uppercase tracking-wider">
                          {durationDays} {durationDays === 1 ? 'day' : 'days'}
                        </span>
                      </div>

                      {/* Conflict Alert Banner */}
                      {getOverlappingLeaves(req, requests).length > 0 && (
                        <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-xs text-rose-800 shadow-sm animate-pulse duration-1000">
                          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-black uppercase tracking-wider text-[9px] block text-rose-600 mb-0.5">Scheduling Conflict</span>
                            <span>
                              {(() => {
                                const ooo = getOverlappingLeaves(req, requests);
                                return ooo.length === 1
                                  ? `${ooo[0].user_name} is already on approved/verified leave during this period.`
                                  : `${ooo.length} employees (${ooo.map(o => o.user_name).join(', ')}) are already on approved/verified leave during this period.`;
                              })()}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Staffing Capacity warning banner */}
                      {capacityWarning && (
                        <div className="p-3 bg-amber-50/50 border border-amber-250 rounded-2xl flex items-start gap-2.5 text-xs text-amber-805 shadow-sm mt-2">
                          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-black uppercase tracking-wider text-[9px] block text-amber-600 mb-0.5">BU Capacity Warning</span>
                            <span>
                              Active staff for this Business Unit will drop to {capacityWarning.percentage}% ({capacityWarning.activeCount} of {capacityWarning.totalCount} active) on {capacityWarning.criticalDate} due to overlapping leaves.
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Reason Block */}
                      <div className="text-slate-605 text-sm bg-indigo-50/20 p-4 rounded-2xl border border-indigo-100/40 italic relative pl-8 pr-6 shadow-sm">
                        <span className="absolute left-3 top-3 text-2xl text-indigo-200 select-none font-serif leading-none">&ldquo;</span>
                        {req.reason}
                        <span className="absolute right-3 bottom-0.5 text-2xl text-indigo-200 select-none font-serif leading-none">&rdquo;</span>
                      </div>

                      {/* Visual Audit Timeline Tracker */}
                      <div className="p-4 bg-slate-50/50 border border-slate-100/60 rounded-2xl space-y-2.5 shadow-sm">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Lifecycle / Status Tracking</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 bg-white border border-slate-150 px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-600 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Submitted</span>
                          </div>

                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

                          <div className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm ${
                            req.status === 'verified' || req.status === 'approved'
                              ? 'bg-indigo-50 border-indigo-150 text-indigo-700'
                              : req.status === 'rejected'
                              ? 'bg-white border-slate-150 text-slate-400 line-through'
                              : 'bg-white border-slate-150 text-slate-400'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${
                              req.status === 'verified' || req.status === 'approved'
                                ? 'bg-indigo-650'
                                : 'bg-slate-300'
                            }`} />
                            <span>Verified</span>
                          </div>

                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

                          <div className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm ${
                            req.status === 'approved'
                              ? 'bg-emerald-50 border-emerald-150 text-emerald-800'
                              : req.status === 'rejected'
                              ? 'bg-rose-50 border-rose-150 text-rose-800'
                              : 'bg-white border-slate-150 text-slate-400'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${
                              req.status === 'approved'
                                ? 'bg-emerald-500'
                                : req.status === 'rejected'
                                ? 'bg-rose-500'
                                : 'bg-slate-300'
                            }`} />
                            <span>
                              {req.status === 'approved' ? 'Approved' : req.status === 'rejected' ? 'Rejected' : 'Final Approval'}
                            </span>
                          </div>
                        </div>
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
                                {req.status === 'approved' ? 'Final Leave Approval' : 'Request Rejected'}
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

                        {(req.status === 'pending' || req.status === 'verified') && isApprover && (
                          <button
                            onClick={() => handleApprove(req.id)}
                            className="flex-1 lg:flex-initial btn text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 font-bold py-2.5 px-4 rounded-xl transition-all shadow-md shadow-indigo-100"
                          >
                            <Check className="w-4 h-4 shrink-0" />
                            <span>Approve Leave</span>
                          </button>
                        )}

                        {(req.status === 'pending' || req.status === 'verified') && (
                          <button
                            onClick={() => handleReject(req.id)}
                            className="flex-1 lg:flex-initial btn text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 flex items-center justify-center gap-1.5 font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm"
                          >
                            <UserX className="w-4 h-4 shrink-0" />
                            <span>Reject Request</span>
                          </button>
                        )}
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

          {myLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
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
                <button onClick={fetchMyLeaves} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {myLoading ? (
                <TableSkeleton cols={4} rows={5} />
              ) : myRequests.length === 0 ? (
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
                      {myRequests.map((r) => (
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
        </>
      )}

      {/* Floating Bulk Actions Bar */}
      {selectedRequestIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white rounded-3xl p-4 shadow-2xl flex flex-col md:flex-row items-stretch md:items-center gap-4 min-w-[320px] md:min-w-[600px] border border-slate-800 backdrop-blur-md animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-2 px-2 shrink-0">
            <span className="px-2 py-0.5 bg-indigo-650 rounded-full text-[10px] font-black">{selectedRequestIds.length}</span>
            <span className="text-xs font-bold text-slate-350">selected requests</span>
          </div>
          
          <input 
            type="text" 
            placeholder="Comments for selected requests..." 
            value={bulkComments}
            onChange={(e) => setBulkComments(e.target.value)}
            className="flex-1 text-xs bg-slate-850 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-500"
          />
          
          <div className="flex items-center gap-2 justify-end shrink-0">
            <button
              onClick={() => handleBulkAction('approve')}
              disabled={bulkLoading}
              className="btn bg-indigo-650 hover:bg-indigo-750 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center gap-1"
            >
              {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Approve</span>
            </button>
            <button
              onClick={() => handleBulkAction('verify')}
              disabled={bulkLoading}
              className="btn bg-slate-800 hover:bg-slate-750 text-slate-205 text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-1 border border-slate-700"
            >
              {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              <span>Verify</span>
            </button>
            <button
              onClick={() => handleBulkAction('reject')}
              disabled={bulkLoading}
              className="btn bg-rose-900/60 hover:bg-rose-950 text-rose-200 border border-rose-800 text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-1"
            >
              {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              <span>Reject</span>
            </button>
            <button
              onClick={() => { setSelectedRequestIds([]); setBulkComments(''); }}
              className="text-xs text-slate-400 hover:text-slate-200 font-bold px-2 py-1 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Employee Leave Profile Quick-View Modal */}
      {(() => {
        if (!profileModalUserId) return null;
        const selectedEmp = employees.find(e => e.id === profileModalUserId);
        const userLeaves = requests.filter(r => r.user_id === profileModalUserId);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl ${getAvatarColorClass(profileModalUserName || '')} flex items-center justify-center font-black text-lg shadow-md uppercase`}>
                    {getInitials(profileModalUserName || '')}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 leading-snug">{profileModalUserName}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {selectedEmp?.job_title || selectedEmp?.role || 'Employee'} &bull; {selectedEmp?.department || 'Operations'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setProfileModalUserId(null); setProfileModalUserName(null); }}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar text-slate-700">
                {/* Grid Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Approved Leaves</span>
                    <span className="text-2xl font-black text-emerald-600 block mt-1">
                      {userLeaves.filter(r => r.status === 'approved').length}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Pending Requests</span>
                    <span className="text-2xl font-black text-amber-600 block mt-1">
                      {userLeaves.filter(r => r.status === 'pending' || r.status === 'verified').length}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Rejected Requests</span>
                    <span className="text-2xl font-black text-rose-600 block mt-1">
                      {userLeaves.filter(r => r.status === 'rejected').length}
                    </span>
                  </div>
                </div>

                {/* Profile Details Card */}
                {selectedEmp && (
                  <div className="bg-indigo-50/20 border border-indigo-100/50 rounded-2xl p-4 space-y-2 text-xs font-bold text-slate-600">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-650 mb-2">Administrative Profile</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase">Email Address</span>
                        <span className="text-slate-705 font-black">{selectedEmp.email}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase">Mobile Number</span>
                        <span className="text-slate-705 font-black">{selectedEmp.mobile || 'Not provided'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase">Hiring Date</span>
                        <span className="text-slate-705 font-black">
                          {selectedEmp.hiring_date ? new Date(selectedEmp.hiring_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase">Business Unit ID</span>
                        <span className="text-slate-705 font-black truncate block">{selectedEmp.business_unit_id || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Past Requests History Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Leave History & Requests</h4>
                  {userLeaves.length === 0 ? (
                    <p className="text-slate-455 text-xs font-medium italic text-center py-4">No leave requests found for this employee.</p>
                  ) : (
                    <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-inner">
                      <table className="w-full text-left text-xs font-bold border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-150 text-slate-450 text-[9px] font-black uppercase tracking-wider">
                            <th className="py-2.5 px-4">Leave Type</th>
                            <th className="py-2.5 px-4">Dates</th>
                            <th className="py-2.5 px-4">Status</th>
                            <th className="py-2.5 px-4">Reason / Comment</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-700">
                          {userLeaves.map(ul => {
                            const s = new Date(ul.start_date);
                            const e = new Date(ul.end_date);
                            const days = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                            return (
                              <tr key={ul.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 px-4 capitalize font-bold text-slate-850">
                                  {ul.leave_type.replace('_', ' ')}
                                </td>
                                <td className="py-3 px-4 text-slate-500 text-[10px]">
                                  {formatDate(ul.start_date)} - {formatDate(ul.end_date)}
                                  <span className="block text-[9px] text-slate-400 font-bold">{days} {days === 1 ? 'day' : 'days'}</span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                    ul.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                                    ul.status === 'verified' ? 'bg-indigo-100 text-indigo-800' :
                                    ul.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                                    'bg-rose-100 text-rose-800'
                                  }`}>
                                    {ul.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-[10px] text-slate-500 max-w-[200px] truncate" title={ul.reason}>
                                  {ul.reason}
                                  {ul.comments && (
                                    <span className="block text-[9px] text-slate-400 italic">Reply: &ldquo;{ul.comments}&rdquo;</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => { setProfileModalUserId(null); setProfileModalUserName(null); }}
                  className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-6 rounded-xl transition-all shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
