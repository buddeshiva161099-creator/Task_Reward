'use client';

import { useState } from 'react';
import api from '@/lib/api';
import {
  FileBarChart, Download, Filter, FileSpreadsheet, FileText, Loader2, Calendar, Brain, Sparkles
} from 'lucide-react';

export default function EmployeeReportsPage() {
  const [filters, setFilters] = useState({
    status: '', priority: '', start_date: '', end_date: '',
  });
  const [downloading, setDownloading] = useState('');

  const buildParams = () => {
    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    return params;
  };

  const downloadReport = async (type: 'tasks/csv' | 'tasks/excel' | 'attendance/excel') => {
    setDownloading(type);
    try {
      const params = {
        ...buildParams(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const res = await api.get(`/reports/me/${type}`, {
        params,
        responseType: 'blob',
      });

      const ext = type.includes('csv') ? 'csv' : 'xlsx';
      const filename = `my_${type.replace('/', '_')}_report.${ext}`;
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
        const filename = `my_ai_${reportType}_report.xlsx`;
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
    } catch (err) {
      console.error('AI Report download failed:', err);
      alert('Failed to generate AI report.');
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Reports & Export</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate and download your personal performance reports</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Filter className="w-5 h-5 text-indigo-500" />
          <h2 className="font-bold text-slate-800">Report Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="select h-11 rounded-xl"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
              className="select h-11 rounded-xl"
            >
              <option value="">All Priorities</option>
              <option value="regular">Regular</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Start Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="input h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">End Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="input h-11 rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tasks CSV */}
        <div className="glass rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 border border-blue-100">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="font-bold text-slate-800 mb-1">My Tasks (CSV)</h3>
          <p className="text-xs text-slate-400 font-medium mb-4">Export your filtered task data as a CSV file</p>
          <button
            onClick={() => downloadReport('tasks/csv')}
            disabled={downloading === 'tasks/csv'}
            className="btn btn-primary w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100"
          >
            {downloading === 'tasks/csv' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><Download className="w-4 h-4" /> Download CSV</>
            )}
          </button>
        </div>

        {/* Tasks Excel */}
        <div className="glass rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4 border border-emerald-100">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="font-bold text-slate-800 mb-1">My Tasks (Excel)</h3>
          <p className="text-xs text-slate-400 font-medium mb-4">Export your filtered task data as an Excel file</p>
          <button
            onClick={() => downloadReport('tasks/excel')}
            disabled={downloading === 'tasks/excel'}
            className="btn btn-primary w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100"
          >
            {downloading === 'tasks/excel' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><Download className="w-4 h-4" /> Download Excel</>
            )}
          </button>
        </div>

        {/* Attendance Report */}
        <div className="glass rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-4 border border-purple-100">
            <Calendar className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="font-bold text-slate-800 mb-1">My Attendance Report</h3>
          <p className="text-xs text-slate-400 font-medium mb-4">Your detailed attendance history in Excel format</p>
          <button
            onClick={() => downloadReport('attendance/excel')}
            disabled={downloading === 'attendance/excel'}
            className="btn btn-primary w-full h-11 rounded-xl bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-100"
          >
            {downloading === 'attendance/excel' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><Download className="w-4 h-4" /> Download Excel</>
            )}
          </button>
        </div>
      </div>

      {/* AI Intelligence Reports Section */}
      <div className="pt-6 border-t border-slate-100">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
            <Brain className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">My AI Summaries & Performance Briefs</h2>
            <p className="text-xs text-slate-400 font-medium">Generate personalized analytical summaries compiled by AI</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { id: 'productivity', label: 'My Productivity Audit', desc: 'Detailed tracking of your task completions, average response time, and workload capacity.' },
            { id: 'attendance', label: 'My Attendance & Consistency Insight', desc: 'Audit of your calendar check-in consistency, late login statistics, and warning flags.' }
          ].map((rep) => (
            <div key={rep.id} className="glass rounded-2xl p-5 border border-indigo-50/80 shadow-sm relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl -mr-12 -mt-12" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100/30">AI Compiled</span>
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
