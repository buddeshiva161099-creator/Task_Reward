'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Employee } from '@/types';
import {
  FileBarChart, Download, Filter, FileSpreadsheet, FileText, Loader2, Calendar, Brain, Sparkles, Trophy, Shield,
  User, Briefcase, Settings, AlertTriangle, X
} from 'lucide-react';


export default function ReportsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filters, setFilters] = useState({
    status: '', employee_id: '', priority: '', start_date: '', end_date: '',
  });
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await api.get('/admin/employees');
        setEmployees(res.data);
      } catch (err) {
        console.error('Failed to fetch employees:', err);
      }
    };
    fetchEmployees();
  }, []);

  const downloadReport = async (type: string) => {
    setDownloading(type);
    try {
      const params: Record<string, any> = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      
      // Map selected employee filter
      if (filters.employee_id) {
        if (type === 'audit/excel') {
          params.actor_id = filters.employee_id;
        } else {
          params.employee_id = filters.employee_id;
        }
      }
      
      // Map selected date range filters
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      
      // Map task-specific filters
      if (type.startsWith('tasks')) {
        if (filters.status) params.status = filters.status;
        if (filters.priority) params.priority = filters.priority;
      }

      const res = await api.get(`/reports/${type}`, {
        params,
        responseType: 'blob',
      });

      const ext = type.includes('csv') ? 'csv' : 'xlsx';
      const filename = `${type.replace('/', '_')}_report.${ext}`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading('');
    }
  };

  const downloadAIReport = async (reportType: string, format: 'excel' | 'html') => {
    const key = `${reportType}_${format}`;
    setDownloading(key);
    try {
      const res = await api.get('/ai/reports/export', {
        params: { report_type: reportType, report_format: format },
        responseType: format === 'excel' ? 'blob' : 'text',
      });

      if (format === 'excel') {
        const filename = `ai_${reportType}_report.xlsx`;
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const newWindow = window.open();
        if (newWindow) {
          newWindow.document.write(res.data);
          newWindow.document.close();
        } else {
          alert('Popup blocked. Please allow popups to view the printable PDF report.');
        }
      }
    } catch (err: any) {
      console.error('AI Report download failed:', err);
      const detail = err.response?.data?.detail || 'Failed to generate AI report.';
      alert(`AI Intelligence Error: ${detail}`);
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports & Export</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate and download business reports</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-indigo-500" />
            <div>
              <h2 className="font-bold text-slate-800">Global Export Filters</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Applies filters to all compatible downloads below</p>
            </div>
          </div>
          {(filters.status || filters.employee_id || filters.priority || filters.start_date || filters.end_date) && (
            <button
              onClick={() => setFilters({ status: '', employee_id: '', priority: '', start_date: '', end_date: '' })}
              className="text-xs font-bold text-indigo-650 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-100/50 px-3 py-2 rounded-xl transition-colors shrink-0 flex items-center justify-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Active Filters</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Status</label>
            <div className="relative">
              <Settings className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-450" />
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full h-11 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all font-bold text-slate-700 cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Employee</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-455" />
              <select
                value={filters.employee_id}
                onChange={(e) => setFilters({ ...filters, employee_id: e.target.value })}
                className="w-full h-11 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all font-bold text-slate-700 cursor-pointer"
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Priority</label>
            <div className="relative">
              <AlertTriangle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-455" />
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className="w-full h-11 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all font-bold text-slate-700 cursor-pointer"
              >
                <option value="">All Priorities</option>
                <option value="regular">Regular</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Start Date</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-455 pointer-events-none" />
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full h-11 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all font-bold text-slate-750"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">End Date</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-455 pointer-events-none" />
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full h-11 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all font-bold text-slate-750"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Export Cards Categories */}
      <div className="space-y-10">
        
        {/* Category 1: Core Operations */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Core Operations Reports</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tasks CSV */}
            <div className="glass rounded-2xl p-6 border border-slate-100 border-l-4 border-l-blue-500 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 border border-blue-100">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">Task Report (CSV)</h3>
              <p className="text-xs text-slate-400 font-medium mb-4">Export filtered task data as a CSV file</p>
              <button
                onClick={() => downloadReport('tasks/csv')}
                disabled={downloading === 'tasks/csv'}
                className="btn btn-primary w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100/50 hover:shadow-xl transition-all cursor-pointer font-bold text-white text-xs"
              >
                {downloading === 'tasks/csv' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Download className="w-4 h-4" /> Download CSV</>
                )}
              </button>
            </div>

            {/* Tasks Excel */}
            <div className="glass rounded-2xl p-6 border border-slate-100 border-l-4 border-l-emerald-500 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4 border border-emerald-100">
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">Task Report (Excel)</h3>
              <p className="text-xs text-slate-400 font-medium mb-4">Export filtered task data as an Excel file</p>
              <button
                onClick={() => downloadReport('tasks/excel')}
                disabled={downloading === 'tasks/excel'}
                className="btn btn-primary w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100/50 hover:shadow-xl transition-all cursor-pointer font-bold text-white text-xs"
              >
                {downloading === 'tasks/excel' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Download className="w-4 h-4" /> Download Excel</>
                )}
              </button>
            </div>

            {/* Employee Report */}
            <div className="glass rounded-2xl p-6 border border-slate-100 border-l-4 border-l-purple-500 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-4 border border-purple-100">
                <FileBarChart className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">Employee List Report</h3>
              <p className="text-xs text-slate-400 font-medium mb-4">Complete employee list and reward summary</p>
              <button
                onClick={() => downloadReport('employees/excel')}
                disabled={downloading === 'employees/excel'}
                className="btn btn-primary w-full h-11 rounded-xl bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-100/50 hover:shadow-xl transition-all cursor-pointer font-bold text-white text-xs"
              >
                {downloading === 'employees/excel' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Download className="w-4 h-4" /> Download Excel</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Category 2: Attendance & Leave Audits */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Attendance & Leaves</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Attendance Report */}
            <div className="glass rounded-2xl p-6 border border-slate-100 border-l-4 border-l-rose-500 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center mb-4 border border-rose-100">
                <Calendar className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">Attendance Report</h3>
              <p className="text-xs text-slate-400 font-medium mb-4">Export detailed attendance for all or specific employees</p>
              <button
                onClick={() => downloadReport('admin/attendance/excel')}
                disabled={downloading === 'admin/attendance/excel'}
                className="btn btn-primary w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-100/50 hover:shadow-xl transition-all cursor-pointer font-bold text-white text-xs"
              >
                {downloading === 'admin/attendance/excel' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Download className="w-4 h-4" /> Download Excel</>
                )}
              </button>
            </div>

            {/* Leaves History Report */}
            <div className="glass rounded-2xl p-6 border border-slate-100 border-l-4 border-l-amber-500 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4 border border-amber-100">
                <Calendar className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">Leaves History Report</h3>
              <p className="text-xs text-slate-400 font-medium mb-4">Export leaves history, approvals, and balances</p>
              <button
                onClick={() => downloadReport('leaves/excel')}
                disabled={downloading === 'leaves/excel'}
                className="btn btn-primary w-full h-11 rounded-xl bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-100/50 hover:shadow-xl transition-all cursor-pointer font-bold text-white text-xs"
              >
                {downloading === 'leaves/excel' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Download className="w-4 h-4" /> Download Excel</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Category 3: Ledgers & Governance */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Ledgers & Governance</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Rewards Point Ledger */}
            <div className="glass rounded-2xl p-6 border border-slate-100 border-l-4 border-l-indigo-500 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-4 border border-indigo-100">
                <Trophy className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">Rewards Point Ledger</h3>
              <p className="text-xs text-slate-400 font-medium mb-4">Export rewards history and point distributions</p>
              <button
                onClick={() => downloadReport('rewards/excel')}
                disabled={downloading === 'rewards/excel'}
                className="btn btn-primary w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100/50 hover:shadow-xl transition-all cursor-pointer font-bold text-white text-xs"
              >
                {downloading === 'rewards/excel' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Download className="w-4 h-4" /> Download Excel</>
                )}
              </button>
            </div>

            {/* System Audit Logs */}
            <div className="glass rounded-2xl p-6 border border-slate-100 border-l-4 border-l-slate-850 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-slate-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4 border border-slate-200">
                <Shield className="w-6 h-6 text-slate-650" />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">System Audit Logs</h3>
              <p className="text-xs text-slate-400 font-medium mb-4">Export activity audit trails and security logs</p>
              <button
                onClick={() => downloadReport('audit/excel')}
                disabled={downloading === 'audit/excel'}
                className="btn btn-primary w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-850 shadow-lg shadow-slate-200/50 hover:shadow-xl transition-all cursor-pointer font-bold text-white text-xs"
              >
                {downloading === 'audit/excel' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Download className="w-4 h-4" /> Download Excel</>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* AI Intelligence Reports Section */}
      <div className="pt-6 border-t border-slate-100">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
            <Brain className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">AI Executive Summaries & Insights</h2>
            <p className="text-xs text-slate-400 font-medium">Generate strategic analysis documents compiled by AI</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { id: 'productivity', label: 'Productivity Audit', desc: 'Employee task completion metrics, delay risks, and burnout index warnings.' },
            { id: 'attendance', label: 'Attendance Insights', desc: 'Irregular absenteeism audits, late login pattern trends, and consistency scores.' },
            { id: 'payroll', label: 'Payroll Variance Scan', desc: 'Unusual overtime spikes, suspicious deductions audit, and monthly variance alerts.' },
            { id: 'executive', label: 'Executive Operations Briefing', desc: 'Holistic business summary covering company-wide alerts, capacity allocation, and strategic recommendations.' }
          ].map((rep) => (
            <div key={rep.id} className="glass rounded-2xl p-5 border border-indigo-50/80 shadow-sm relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100/30">AI Generated</span>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                </div>
                <h4 className="font-extrabold text-slate-800 text-sm mb-1">{rep.label}</h4>
                <p className="text-[11px] text-slate-450 font-semibold leading-relaxed mb-4">{rep.desc}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => downloadAIReport(rep.id, 'excel')}
                  disabled={!!downloading}
                  className="btn btn-secondary h-10 rounded-xl text-xs font-bold bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50/50 flex items-center justify-center gap-1"
                >
                  {downloading === `${rep.id}_excel` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>Excel Sheet</>
                  )}
                </button>
                <button
                  onClick={() => downloadAIReport(rep.id, 'html')}
                  disabled={!!downloading}
                  className="btn btn-primary h-10 rounded-xl text-xs font-bold bg-indigo-650 hover:bg-indigo-750 shadow-lg shadow-indigo-100 flex items-center justify-center gap-1 text-white"
                >
                  {downloading === `${rep.id}_html` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>Print / PDF</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
