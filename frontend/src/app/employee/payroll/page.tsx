'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { DollarSign, FileText, CheckCircle2, RefreshCw, Printer, AlertCircle, Calendar } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ListSkeleton, DashboardSkeleton } from '@/components/SkeletonLoaders';

interface Payslip {
  id: string;
  month: string;
  base_salary: number;
  gross_earnings: number;
  total_deductions: number;
  net_salary: number;
  overtime_pay: number;
  incentives: number;
  bonuses: number;
  
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
  penalties: number;
  
  status: string;
  created_at: string;
  version_number?: number;
}

export default function EmployeePayrollPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);

  const [history, setHistory] = useState<any[]>([]);
  const [viewingHistoryVersion, setViewingHistoryVersion] = useState<any | null>(null);

  useEffect(() => {
    if (selectedSlip) {
      api.get(`/payroll/${selectedSlip.id}/history`)
        .then(res => setHistory(res.data))
        .catch(err => console.error('Error fetching payroll history:', err));
      setViewingHistoryVersion(null);
    } else {
      setHistory([]);
      setViewingHistoryVersion(null);
    }
  }, [selectedSlip]);

  const displaySlip = viewingHistoryVersion
    ? {
        ...selectedSlip,
        ...viewingHistoryVersion.snapshot,
        gross_earnings: (viewingHistoryVersion.snapshot.earned_salary || 0) + (viewingHistoryVersion.snapshot.overtime_pay || 0) + (viewingHistoryVersion.snapshot.incentives || 0) + (viewingHistoryVersion.snapshot.bonuses || 0),
        total_deductions: (viewingHistoryVersion.snapshot.penalties || 0) + (viewingHistoryVersion.snapshot.deductions || 0) + (viewingHistoryVersion.snapshot.pf_deduction || 0) + (viewingHistoryVersion.snapshot.esi_deduction || 0) + (viewingHistoryVersion.snapshot.tax_deduction || 0),
        version_number: viewingHistoryVersion.version_number,
      }
    : selectedSlip;

  const loadPayslips = async () => {
    try {
      setLoading(true);
      const res = await api.get('/payroll/my-payslips');
      setPayslips(res.data);
      if (res.data.length > 0) {
        setSelectedSlip(res.data[0]);
      }
    } catch (err) {
      console.error('Error fetching employee payslips:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayslips();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight gradient-text">My Compensation & Payslips</h1>
          <p className="text-slate-500">View salary structure breakdowns, deductions audits, and print official monthly pay statements.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Payslips List */}
        <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm h-fit">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800">Monthly Statements</h2>
            <button 
              onClick={loadPayslips} 
              className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-650 transition-colors"
              title="Refresh lists"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <ListSkeleton count={5} />
          ) : payslips.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-12 font-medium">
              No payroll releases recorded yet for this fiscal cycle.
            </div>
          ) : (
            <div className="space-y-3">
              {payslips.map((slip) => (
                <button
                  key={slip.id}
                  onClick={() => setSelectedSlip(slip)}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                    selectedSlip?.id === slip.id
                      ? 'bg-indigo-50/50 border-indigo-250 shadow-sm'
                      : 'bg-slate-50/20 border-slate-150 hover:bg-slate-50/60'
                  }`}
                >
                  <div>
                    <span className="text-sm font-bold text-slate-850 block mb-0.5">{slip.month}</span>
                    <span className="text-xs text-slate-400 font-bold">Net Payout: ₹{slip.net_salary.toLocaleString('en-IN')}</span>
                  </div>
                  <FileText className={`w-5 h-5 ${selectedSlip?.id === slip.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Selected Payslip High-Fi Preview */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="bg-white border border-slate-150 rounded-2xl p-8 shadow-sm space-y-8 animate-pulse">
              <div className="flex justify-between items-start border-b border-slate-100 pb-6">
                <div className="space-y-3 flex-1">
                  <div className="h-2 bg-slate-100 rounded w-24" />
                  <div className="h-8 bg-slate-100 rounded w-64" />
                  <div className="h-3 bg-slate-50 rounded w-40" />
                </div>
                <div className="h-12 bg-slate-100 rounded-xl w-32" />
              </div>
              <div className="grid grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-slate-50 rounded-xl" />)}
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="h-4 bg-slate-100 rounded w-32" />
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-4 bg-slate-50 rounded" />)}
                </div>
                <div className="space-y-4">
                  <div className="h-4 bg-slate-100 rounded w-32" />
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-4 bg-slate-50 rounded" />)}
                </div>
              </div>
            </div>
          ) : selectedSlip && displaySlip ? (
            <div className="bg-white border border-slate-150 rounded-2xl p-8 shadow-sm space-y-6">
              
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-6 flex-wrap gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em]">Official Corporate Statement</span>
                  <h2 className="text-2xl font-black text-slate-900 mt-1">PAYSLIP FOR {displaySlip.month.toUpperCase()} (v{displaySlip.version_number || 1})</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Reference ID: {displaySlip.id}</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => window.print()}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2.5 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 font-bold text-xs"
                    title="Print Statement"
                  >
                    <Printer className="w-4 h-4" />
                    Print Statement
                  </button>
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-250 px-5 py-2.5 rounded-2xl text-center shadow-sm">
                    <div className="text-[9px] font-extrabold uppercase tracking-widest mb-0.5 text-emerald-600">NET DISBURSED</div>
                    <div className="text-xl font-black">₹{displaySlip.net_salary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>

              {/* Version History Selector */}
              {history.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between gap-4">
                  <span className="text-slate-500 font-bold text-xs">Previous versions available:</span>
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
                    className="text-xs border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-slate-800"
                  >
                    <option value="current">v{selectedSlip.version_number} (Current)</option>
                    {history.map(h => (
                      <option key={h.version_number} value={h.version_number}>
                        v{h.version_number} (Archived {formatDate(h.created_at)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Working Days & Attendance Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-center font-bold">
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">Total Working Days</span>
                  <span className="text-slate-800 block text-sm mt-0.5">{displaySlip.total_working_days}d</span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">Present Days</span>
                  <span className="text-emerald-700 block text-sm mt-0.5">{displaySlip.present_days}d</span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">Paid Leaves</span>
                  <span className="text-indigo-600 block text-sm mt-0.5">{displaySlip.paid_leaves}d</span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">Holidays & Wknds</span>
                  <span className="text-slate-600 block text-sm mt-0.5">{displaySlip.holidays_weekends}d</span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-extrabold">LOP Absences</span>
                  <span className="text-rose-600 block text-sm mt-0.5">{displaySlip.absent_days}d</span>
                </div>
              </div>

              {/* Earnings & Deductions Tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Earnings */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 border-b pb-1 text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Earnings Breakdown
                  </h3>
                  <div className="space-y-3 text-sm font-semibold">
                    <div className="flex justify-between text-slate-500">
                      <span>Basic Pay:</span>
                      <span className="text-slate-800">₹{displaySlip.basic.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>HRA Component:</span>
                      <span className="text-slate-800">₹{displaySlip.hra.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Special Allowances:</span>
                      <span className="text-slate-800">₹{displaySlip.special_allowance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Overtime Payout:</span>
                      <span className="text-emerald-700">+ ₹{displaySlip.overtime_pay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Incentives & Bonuses:</span>
                      <span className="text-emerald-700">+ ₹{(displaySlip.incentives + displaySlip.bonuses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded-lg text-xs font-bold">
                      <span>Loss of Pay (LOP) Penalty:</span>
                      <span>- ₹{displaySlip.lop_deduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="h-px bg-slate-200 my-2" />
                    <div className="flex justify-between text-slate-900 font-black pt-1">
                      <span>Gross Salary Earned:</span>
                      <span>₹{displaySlip.gross_earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 border-b pb-1 text-rose-700">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Deductions & Retainage
                  </h3>
                  <div className="space-y-3 text-sm font-semibold">
                    <div className="flex justify-between text-slate-500">
                      <span>Provident Fund (PF):</span>
                      <span className="text-slate-800">₹{displaySlip.pf_deduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>ESI Contribution:</span>
                      <span className="text-slate-800">₹{displaySlip.esi_deduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>TDS / Income Tax:</span>
                      <span className="text-slate-800">₹{displaySlip.tax_deduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Late penalties:</span>
                      <span className="text-rose-600">₹{displaySlip.penalties.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="h-px bg-slate-200 my-2" />
                    <div className="flex justify-between text-slate-900 font-black pt-1">
                      <span>Total Deductions:</span>
                      <span className="text-rose-600">₹{displaySlip.total_deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Net Payout Message */}
              <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3 mt-4 text-xs text-indigo-800 font-medium">
                <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-950 block">Payment Disbursed Successfully</span>
                  <span>This payslip details the net compensation for the Month Cycle of {displaySlip.month}. Calculations are derived from approved attendance punch logs, regularization audits, and structural base components.</span>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white border border-slate-150 rounded-2xl p-12 text-center shadow-sm h-full flex flex-col justify-center items-center">
              <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Select a monthly payslip from the left panel to load the statement breakdown.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
