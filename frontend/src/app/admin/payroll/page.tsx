'use client';

import { useState, useEffect, Fragment } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { 
  DollarSign, Settings, PlusCircle, Check, X, ShieldAlert, Sparkles, 
  FileText, Play, RefreshCw, Layers, Building2, User, Briefcase, 
  AlertTriangle, CheckCircle, Eye, Printer, ArrowRight
} from 'lucide-react';
import { TableSkeleton, DashboardSkeleton } from '@/components/SkeletonLoaders';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  hiring_company?: string;
}

interface Company {
  id: string;
  name: string;
  is_active: boolean;
}

interface PayrollDraft {
  id: string;
  user_id: string;
  user_name: string;
  month: string;
  status: string;
  base_salary: number;
  net_salary: number;
  drafted_by: string | null;
  reviewed_by: string | null;
  
  // Detailed fields
  basic: number;
  hra: number;
  special_allowance: number;
  pf_deduction: number;
  esi_deduction: number;
  tax_deduction: number;
  present_days: number;
  absent_days: number;
  paid_leaves: number;
  holidays_weekends: number;
  total_working_days: number;
  lop_deduction: number;
  overtime_pay: number;
  penalties: number;
  incentives: number;
  bonuses: number;
  deductions: number;
  recalculation_required?: boolean;
  version_number?: number;
}

export default function PayrollManagementPage() {
  const { isHRTeam, isAdmin, user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [drafts, setDrafts] = useState<PayrollDraft[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  // Run Payroll Form State
  const [runMonth, setRunMonth] = useState('2026-05');
  const [runCompanyId, setRunCompanyId] = useState('');
  const [runDept, setRunDept] = useState('');
  const [runEmployeeId, setRunEmployeeId] = useState('');
  const [runningPayroll, setRunningPayroll] = useState(false);
  const [runResult, setRunResult] = useState<{
    total_employees_processed: number;
    total_payout: number;
    pending_employees: number;
    errors: string[];
    missing_attendance: string[];
  } | null>(null);

  // Salary Structure Form State
  const [structUserId, setStructUserId] = useState('');
  const [basic, setBasic] = useState(0);
  const [hra, setHra] = useState(0);
  const [special, setSpecial] = useState(0);
  const [pf, setPf] = useState(0);
  const [esi, setEsi] = useState(0);
  const [tax, setTax] = useState(0);

  // Manual Draft Form State
  const [draftUserId, setDraftUserId] = useState('');
  const [draftMonth, setDraftMonth] = useState('2026-05');
  const [overtime, setOvertime] = useState(0);
  const [incentives, setIncentives] = useState(0);
  const [bonuses, setBonuses] = useState(0);
  const [penalties, setPenalties] = useState(0);
  const [deductions, setDeductions] = useState(0);

  // Active UI States
  const [expandedPayrollId, setExpandedPayrollId] = useState<string | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollDraft | null>(null);

  const [history, setHistory] = useState<any[]>([]);
  const [viewingHistoryVersion, setViewingHistoryVersion] = useState<any | null>(null);

  useEffect(() => {
    if (selectedPayslip) {
      api.get(`/payroll/${selectedPayslip.id}/history`)
        .then(res => setHistory(res.data))
        .catch(err => console.error('Error fetching payroll history:', err));
      setViewingHistoryVersion(null);
    } else {
      setHistory([]);
      setViewingHistoryVersion(null);
    }
  }, [selectedPayslip]);

  const displayPayslip = viewingHistoryVersion
    ? {
        ...selectedPayslip,
        ...viewingHistoryVersion.snapshot,
        version_number: viewingHistoryVersion.version_number,
      }
    : selectedPayslip;

  const loadData = async () => {
    try {
      setLoading(true);
      const [empRes, draftRes, companyRes] = await Promise.all([
        api.get('/admin/employees'),
        api.get('/payroll/pending'),
        api.get('/companies'),
      ]);
      
      setEmployees(empRes.data);
      setDrafts(draftRes.data);
      setCompanies(companyRes.data);
      
      if (companyRes.data.length > 0 && !runCompanyId) {
        setRunCompanyId(companyRes.data[0].id);
      }

      const depts = Array.from(
        new Set(
          empRes.data
            .map((e: Employee) => e.department)
            .filter((d: string | undefined): d is string => !!d)
        )
      ) as string[];
      setDepartments(depts);
    } catch (err) {
      console.error('Error loading payroll admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isHRTeam) {
      loadData();
    }
  }, [isHRTeam]);

  const handleRunPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runCompanyId) return alert('Please select a company.');
    
    setRunningPayroll(true);
    setRunResult(null);
    try {
      const res = await api.post('/payroll/run', {
        company_id: runCompanyId,
        month: runMonth,
        department_id: runDept || undefined,
        employee_id: runEmployeeId || undefined
      });
      setRunResult(res.data);
      setFeedback(`Payroll run execution completed for ${runMonth}!`);
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to execute payroll run.');
    } finally {
      setRunningPayroll(false);
    }
  };

  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structUserId) return alert('Select employee');

    try {
      await api.post('/payroll/structure', {
        user_id: structUserId,
        basic,
        hra,
        special_allowance: special,
        pf_deduction: pf,
        esi_deduction: esi,
        tax_deduction: tax,
      });
      setFeedback('Salary structure successfully configured!');
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to configure salary structure.');
    }
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftUserId) return alert('Select employee');

    try {
      await api.post('/payroll/draft', {
        user_id: draftUserId,
        month: draftMonth,
        overtime_pay: overtime,
        incentives,
        bonuses,
        penalties,
        deductions,
        automated: false
      });
      setFeedback('Monthly payroll draft generated manually!');
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to generate payroll draft.');
    }
  };

  const handleCreateAutomatedDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftUserId) return alert('Select employee');

    try {
      setLoading(true);
      await api.post('/payroll/draft', {
        user_id: draftUserId,
        month: draftMonth,
        automated: true
      });
      setFeedback(`Automated payroll calculation completed for employee!`);
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to generate automated payroll draft.');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (id: string) => {
    try {
      await api.post(`/payroll/review/${id}`, {});
      setFeedback('Payroll run marked as Under Review!');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/payroll/approve/${id}`, {});
      setFeedback('Payroll approved, locked, and payslip generated!');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await api.post(`/payroll/mark-paid/${id}`, {});
      setFeedback('Payroll successfully marked as Paid!');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlock = async (id: string) => {
    try {
      await api.post(`/payroll/unlock/${id}`, {});
      setFeedback('Payroll run unlocked and reverted to Draft.');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecalculate = async (id: string) => {
    try {
      setLoading(true);
      const res = await api.post(`/payroll/recalculate/${id}`);
      setFeedback(res.data.message || 'Payroll recalculated successfully!');
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to recalculate payroll.');
    } finally {
      setLoading(false);
    }
  };

  if (!isHRTeam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white/40 backdrop-blur-md rounded-2xl border border-slate-200">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-black text-slate-800">Access Denied</h2>
        <p className="text-slate-500 mt-2">Only authorized HR or Admin members can access this console.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight gradient-text">Payroll & Compensation Engine</h1>
          <p className="text-slate-500">Configure salary structures, trigger automated payroll batches, and manage payment workflows.</p>
        </div>
      </div>

      {feedback && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-xl text-sm font-semibold flex items-center gap-3 animate-pulse">
          <Sparkles className="w-5 h-5 text-indigo-600 flex-shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Main Control Hub Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Run Payroll Batch Engine */}
        <div className="lg:col-span-1 bg-white border border-slate-150 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Play className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">Batch Payroll Console</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">Trigger an automated calculation run for a specific month and scope. Checks active days, attendance logs, leaves, structure, and LOP.</p>
            
            <form onSubmit={handleRunPayroll} className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Company *</label>
                <select
                  value={runCompanyId}
                  onChange={(e) => setRunCompanyId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  required
                >
                  <option value="">Select Company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Month *</label>
                  <input
                    type="month"
                    value={runMonth}
                    onChange={(e) => setRunMonth(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-xl p-2 bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Department</label>
                  <select
                    value={runDept}
                    onChange={(e) => setRunDept(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Employee Scope</label>
                <select
                  value={runEmployeeId}
                  onChange={(e) => setRunEmployeeId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">All Employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={runningPayroll}
                className="w-full py-3 mt-2 rounded-xl bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {runningPayroll ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Calculating Salary Components...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run Payroll Engine
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Salary Structure Configuration */}
        <div className="lg:col-span-1 bg-white border border-slate-150 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Salary Structure Setup</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">Define gross and deduction structures for employee profiles. Base calculations use these items.</p>
          <form onSubmit={handleSaveStructure} className="space-y-3">
            <div>
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Employee</label>
              <select
                value={structUserId}
                onChange={(e) => setStructUserId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl p-2 bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Choose Employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">BASIC</label>
                <input
                  type="number"
                  value={basic}
                  onChange={(e) => setBasic(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">HRA</label>
                <input
                  type="number"
                  value={hra}
                  onChange={(e) => setHra(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">ALLOWANCE</label>
                <input
                  type="number"
                  value={special}
                  onChange={(e) => setSpecial(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">PF DEDUCT</label>
                <input
                  type="number"
                  value={pf}
                  onChange={(e) => setPf(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">ESI DEDUCT</label>
                <input
                  type="number"
                  value={esi}
                  onChange={(e) => setEsi(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">TAX DEDUCT</label>
                <input
                  type="number"
                  value={tax}
                  onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
            >
              Save Structure
            </button>
          </form>
        </div>

        {/* Generate / Modify Single Pay Run Draft */}
        <div className="lg:col-span-1 bg-white border border-slate-150 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <PlusCircle className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Single Pay Entry</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">Review adjustments, manual overrides, bonuses, and penalties for individual pay files.</p>
          <form className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">EMPLOYEE</label>
                <select
                  value={draftUserId}
                  onChange={(e) => setDraftUserId(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">MONTH</label>
                <input
                  type="text"
                  placeholder="2026-05"
                  value={draftMonth}
                  onChange={(e) => setDraftMonth(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400 font-bold">OVERTIME</label>
                <input
                  type="number"
                  value={overtime}
                  onChange={(e) => setOvertime(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400 font-bold">INCENTIVES</label>
                <input
                  type="number"
                  value={incentives}
                  onChange={(e) => setIncentives(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400 font-bold">BONUSES</label>
                <input
                  type="number"
                  value={bonuses}
                  onChange={(e) => setBonuses(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">PENALTIES</label>
                <input
                  type="number"
                  value={penalties}
                  onChange={(e) => setPenalties(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-400">OTHER DEDUCTS</label>
                <input
                  type="number"
                  value={deductions}
                  onChange={(e) => setDeductions(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleCreateAutomatedDraft}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] py-2 rounded-xl transition-all"
              >
                Auto Compute
              </button>
              <button
                type="button"
                onClick={handleCreateDraft}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] py-2 rounded-xl transition-all"
              >
                Manual Draft
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Batch Processing Execution Report */}
      {runResult && (
        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 translate-x-12 -translate-y-6">
            <Building2 className="w-64 h-64 text-indigo-500" />
          </div>
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
              <CheckCircle className="w-5 h-5" />
              <span>Payroll Processing Execution Summary</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2">
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="block text-[10px] text-slate-400 uppercase font-extrabold">Processed</span>
                <span className="text-2xl font-black text-white mt-1 block">{runResult.total_employees_processed}</span>
              </div>
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="block text-[10px] text-slate-400 uppercase font-extrabold">Total Payout</span>
                <span className="text-2xl font-black text-indigo-300 mt-1 block">₹{runResult.total_payout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="block text-[10px] text-slate-400 uppercase font-extrabold">Pending</span>
                <span className="text-2xl font-black text-amber-400 mt-1 block">{runResult.pending_employees}</span>
              </div>
              <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
                <span className="block text-[10px] text-slate-400 uppercase font-extrabold">Target Cycle</span>
                <span className="text-2xl font-black text-slate-200 mt-1 block">{runMonth}</span>
              </div>
            </div>

            {runResult.errors && runResult.errors.length > 0 && (
              <div className="bg-rose-950/60 border border-rose-800 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-rose-350 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Processing Errors ({runResult.errors.length})</span>
                </div>
                <ul className="list-disc list-inside text-xs text-rose-200 space-y-1 pl-1">
                  {runResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {runResult.missing_attendance && runResult.missing_attendance.length > 0 && (
              <div className="bg-amber-950/60 border border-amber-800 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-350 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Missing Attendance Warnings ({runResult.missing_attendance.length})</span>
                </div>
                <ul className="list-disc list-inside text-xs text-amber-200 space-y-1 pl-1">
                  {runResult.missing_attendance.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table of Monthly Payroll Runs / Drafts */}
      <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Pay Runs Pipeline</h2>
          </div>
          <span className="text-xs text-slate-500 font-bold">Total runs: {drafts.length}</span>
        </div>

        {loading ? (
          <TableSkeleton cols={9} rows={8} />
        ) : drafts.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No active payroll runs found. Use the Batch Payroll Console to trigger calculated drafts.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-150 text-slate-450 pb-2 uppercase font-extrabold tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Month</th>
                  <th className="py-3 px-3 text-right">Base salary</th>
                  <th className="py-3 px-3 text-right">Earnings</th>
                  <th className="py-3 px-3 text-right">Deductions</th>
                  <th className="py-3 px-3 text-right">LOP deduct</th>
                  <th className="py-3 px-3 text-right text-indigo-650 font-bold">Net salary</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {drafts.map((d) => {
                  const isExpanded = expandedPayrollId === d.id;
                  const totalEarnings = d.basic + d.hra + d.special_allowance + d.overtime_pay + d.incentives + d.bonuses - d.lop_deduction;
                  const totalDeducts = d.pf_deduction + d.esi_deduction + d.tax_deduction + d.penalties + d.deductions;
                  
                  return (
                    <Fragment key={d.id}>
                      <tr key={d.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="py-4 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button 
                              onClick={() => setExpandedPayrollId(isExpanded ? null : d.id)}
                              className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors focus:outline-none"
                            >
                              <span className="text-left">{d.user_name}</span>
                              <span className="text-[10px] text-slate-400 font-medium">({isExpanded ? 'Hide' : 'Show'})</span>
                            </button>
                            {d.recalculation_required && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-100 text-amber-850 border border-amber-250 animate-pulse uppercase">
                                Updates Pending
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-500 font-bold">{d.month}</td>
                        <td className="py-4 px-3 text-right text-slate-600">₹{d.base_salary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-3 text-right text-emerald-700">₹{totalEarnings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-3 text-right text-rose-700">₹{totalDeducts.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-3 text-right text-amber-700 font-semibold">₹{d.lop_deduction.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-3 text-right font-black text-indigo-700">₹{d.net_salary.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-4 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                            d.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            d.status === 'under_review' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            d.status === 'approved' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                            d.status === 'locked' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {d.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex gap-1.5 justify-end items-center">
                            <button
                              onClick={() => setSelectedPayslip(d)}
                              className="text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg transition-colors"
                              title="View detailed payslip"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {(user?.role === 'hr_manager' || isAdmin) && (
                              <button
                                onClick={() => handleRecalculate(d.id)}
                                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                                  d.recalculation_required 
                                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 animate-pulse' 
                                    : 'text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200'
                                }`}
                                title={d.recalculation_required ? "Changes detected! Recalculate Payroll" : "Recalculate Payroll"}
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${d.recalculation_required ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                            
                            {d.status === 'draft' && (user?.role === 'hr_manager' || isAdmin) && (
                              <button
                                onClick={() => handleReview(d.id)}
                                className="bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-lg font-bold text-[10px] transition-colors"
                              >
                                Verify & Review
                              </button>
                            )}
                            
                            {d.status === 'under_review' && isAdmin && (
                              <button
                                onClick={() => handleApprove(d.id)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 rounded-lg font-bold text-[10px] transition-all"
                              >
                                Approve & Lock
                              </button>
                            )}

                            {d.status === 'locked' && (user?.role === 'hr_manager' || isAdmin) && (
                              <button
                                onClick={() => handleMarkPaid(d.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3 rounded-lg font-bold text-[10px] transition-all"
                              >
                                Mark Paid
                              </button>
                            )}

                            {d.status === 'locked' && isAdmin && (
                              <button
                                onClick={() => handleUnlock(d.id)}
                                className="bg-rose-50 text-rose-700 hover:bg-rose-100 py-1.5 px-2 rounded-lg font-bold text-[10px] transition-colors"
                                title="Unlock run"
                              >
                                Unlock
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={9} className="py-4 px-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div>
                                <span className="block text-slate-400 font-extrabold uppercase text-[9px] tracking-wider">Salary Components</span>
                                <div className="space-y-1 mt-1 text-slate-700">
                                  <div>Basic: ₹{d.basic.toLocaleString('en-IN')}</div>
                                  <div>HRA: ₹{d.hra.toLocaleString('en-IN')}</div>
                                  <div>Allowance: ₹{d.special_allowance.toLocaleString('en-IN')}</div>
                                </div>
                              </div>
                              <div>
                                <span className="block text-slate-400 font-extrabold uppercase text-[9px] tracking-wider">Deductions breakdown</span>
                                <div className="space-y-1 mt-1 text-slate-700">
                                  <div>Provident Fund (PF): ₹{d.pf_deduction.toLocaleString('en-IN')}</div>
                                  <div>ESI: ₹{d.esi_deduction.toLocaleString('en-IN')}</div>
                                  <div>Income Tax: ₹{d.tax_deduction.toLocaleString('en-IN')}</div>
                                </div>
                              </div>
                              <div>
                                <span className="block text-slate-400 font-extrabold uppercase text-[9px] tracking-wider">Attendance statistics</span>
                                <div className="space-y-1 mt-1 text-slate-700">
                                  <div>Work days in month: {d.total_working_days} days</div>
                                  <div>Present: {d.present_days} days</div>
                                  <div>Absent (LOP): {d.absent_days} days</div>
                                  <div>Paid leaves: {d.paid_leaves} days</div>
                                </div>
                              </div>
                              <div>
                                <span className="block text-slate-400 font-extrabold uppercase text-[9px] tracking-wider">Additions / Penalties</span>
                                <div className="space-y-1 mt-1 text-slate-700">
                                  <div>Overtime Pay: ₹{d.overtime_pay.toLocaleString('en-IN')}</div>
                                  <div>Incentives / Bonus: ₹{(d.incentives + d.bonuses).toLocaleString('en-IN')}</div>
                                  <div className="text-rose-600">Late penalties: ₹{d.penalties.toLocaleString('en-IN')}</div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payslip Modal View */}
      {selectedPayslip && displayPayslip && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="bg-indigo-900 p-6 text-white flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black">Official Salary Slip</h3>
                <p className="text-indigo-200 text-xs mt-1">Month Cycle: {displayPayslip.month} (v{displayPayslip.version_number || 1})</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-indigo-850 hover:bg-indigo-800 p-2 rounded-xl text-white transition-colors"
                  title="Print payslip"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setSelectedPayslip(null)}
                  className="bg-indigo-850 hover:bg-indigo-800 p-2 rounded-xl text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto flex-grow text-xs text-slate-700">
              {/* Version History Selector */}
              {history.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between gap-4">
                  <span className="text-slate-500 font-bold">Previous versions available:</span>
                  <select
                    value={viewingHistoryVersion ? viewingHistoryVersion.version_number : 'current'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'current') {
                        setViewingHistoryVersion(null);
                      } else {
                        const matched = history.find(h => h.version_number === parseInt(val));
                        setViewingHistoryVersion(matched || null);
                      }
                    }}
                    className="text-xs border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-extrabold text-slate-800"
                  >
                    <option value="current">v{selectedPayslip.version_number} (Current)</option>
                    {history.map(h => (
                      <option key={h.version_number} value={h.version_number}>
                        v{h.version_number} (Archived {formatDate(h.created_at)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Header Info */}
              <div className="flex justify-between items-center border-b pb-4">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">{displayPayslip.user_name}</h4>
                  <p className="text-slate-400">Employee ID: {displayPayslip.user_id}</p>
                </div>
                <div className="text-right">
                  <h5 className="font-black text-indigo-700 text-base">₹{displayPayslip.net_salary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h5>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider">
                    {displayPayslip.status}
                  </span>
                </div>
              </div>

              {/* Working Days & Stats Grid */}
              <div className="grid grid-cols-4 gap-2 bg-slate-50 p-4 rounded-xl border border-slate-100 text-center font-bold">
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">Total Work Days</span>
                  <span className="text-slate-800 block text-sm mt-0.5">{displayPayslip.total_working_days}d</span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">Present Days</span>
                  <span className="text-emerald-700 block text-sm mt-0.5">{displayPayslip.present_days}d</span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">Paid Leaves</span>
                  <span className="text-indigo-600 block text-sm mt-0.5">{displayPayslip.paid_leaves}d</span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">LOP Absences</span>
                  <span className="text-rose-600 block text-sm mt-0.5">{displayPayslip.absent_days}d</span>
                </div>
              </div>

              {/* Details table */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Earnings */}
                <div className="space-y-3">
                  <h6 className="font-bold text-slate-900 border-b pb-1 text-xs uppercase tracking-wider text-emerald-700">Earnings Components</h6>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Basic Salary:</span>
                      <span className="font-bold">₹{displayPayslip.basic.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>HRA Component:</span>
                      <span className="font-bold">₹{displayPayslip.hra.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Special Allowance:</span>
                      <span className="font-bold">₹{displayPayslip.special_allowance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Overtime Pay:</span>
                      <span className="font-bold text-emerald-700">+ ₹{displayPayslip.overtime_pay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Incentives & Bonuses:</span>
                      <span className="font-bold text-emerald-700">+ ₹{(displayPayslip.incentives + displayPayslip.bonuses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-rose-700 font-semibold border-t pt-1 bg-rose-50/30 px-1 rounded">
                      <span>Loss of Pay (LOP) Deduction:</span>
                      <span>- ₹{displayPayslip.lop_deduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between font-black border-t pt-2 text-slate-800">
                      <span>Gross Earned:</span>
                      <span>₹{(displayPayslip.basic + displayPayslip.hra + displayPayslip.special_allowance + displayPayslip.overtime_pay + displayPayslip.incentives + displayPayslip.bonuses - displayPayslip.lop_deduction).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions */}
                <div className="space-y-3">
                  <h6 className="font-bold text-slate-900 border-b pb-1 text-xs uppercase tracking-wider text-rose-700">Deductions Breakdown</h6>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Provident Fund (PF):</span>
                      <span className="font-bold">₹{displayPayslip.pf_deduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ESI Contribution:</span>
                      <span className="font-bold">₹{displayPayslip.esi_deduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Professional Income Tax:</span>
                      <span className="font-bold">₹{displayPayslip.tax_deduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Late Check-in Penalties:</span>
                      <span className="font-bold">₹{displayPayslip.penalties.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Other Manual Deductions:</span>
                      <span className="font-bold">₹{displayPayslip.deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between font-black border-t pt-2 text-slate-800 mt-auto">
                      <span>Total Deducted:</span>
                      <span>₹{(displayPayslip.pf_deduction + displayPayslip.esi_deduction + displayPayslip.tax_deduction + displayPayslip.penalties + displayPayslip.deductions).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Net Payout Summary */}
              <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex justify-between items-center text-indigo-900 mt-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider block text-indigo-500">Net Payable Amount</span>
                  <span className="text-xs italic text-indigo-600">Earned Gross minus Total Deductions</span>
                </div>
                <span className="text-xl font-black">₹{displayPayslip.net_salary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setSelectedPayslip(null)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-sm transition-colors"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
