'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Brain, Sparkles, AlertTriangle, TrendingUp, Compass, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

export default function AIInsightPanel() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchSummary() {
      try {
        setLoading(true);
        const res = await api.get('/ai/dashboard-summary');
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch AI dashboard summary:', err);
        setError('AI workforce intelligence is temporarily unavailable.');
      } finally {
        setLoading(false);
      }
    }
    if (user) {
      fetchSummary();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Skeleton className="lg:col-span-2 h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="lg:col-span-3 h-24 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return null; // Degrade gracefully by not rendering if unavailable
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      {/* 1. AI Summary Card */}
      <div className="lg:col-span-2 glass rounded-2xl p-6 border border-indigo-100/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
        <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-100">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                AI Workforce Intelligence
                <span className="text-[9px] bg-indigo-50 text-indigo-600 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                  Active
                </span>
              </h3>
            </div>
            <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
          </div>
          <p className="text-sm text-slate-650 leading-relaxed font-medium">
            {data.ai_summary}
          </p>
        </div>

        {/* Stats Summary footer */}
        <div className="mt-4 pt-4 border-t border-slate-100/60 grid grid-cols-3 gap-4 text-center">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Scope Productivity</span>
            <span className="text-base font-black text-indigo-600">{data.performance_intelligence?.team_average ?? 0}%</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Burnout Flags</span>
            <span className="text-base font-black text-rose-500">{data.performance_intelligence?.burnout_risks?.length ?? 0}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Late login Trends</span>
            <span className="text-base font-black text-amber-500">{data.attendance_intelligence?.late_login_trends?.length ?? 0}</span>
          </div>
        </div>
      </div>

      {/* 2. Recommendations & Action Items */}
      <div className="glass rounded-2xl p-6 border border-emerald-100/50 shadow-sm relative overflow-hidden flex flex-col hover:shadow-md transition-shadow">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-100">
            <Compass className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-slate-800 tracking-tight">AI Strategic Actions</h3>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto max-h-[170px] custom-scrollbar pr-1">
          {data.recommendations?.map((rec: string, idx: number) => (
            <div key={idx} className="flex gap-2.5 items-start bg-emerald-50/20 border border-emerald-100/30 p-2.5 rounded-xl">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-emerald-850 leading-normal">{rec}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Alerts Widget (Inline Overlay for Admin/Managers or personalized for Employees) */}
      <div className="lg:col-span-3 glass rounded-2xl p-5 border border-rose-100/50 shadow-sm relative overflow-hidden hover:shadow-md transition-shadow">
        <div className="absolute top-0 right-0 w-44 h-44 bg-rose-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-md shadow-rose-100">
            <AlertTriangle className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="font-bold text-slate-850 text-sm tracking-tight">AI Operational Anomalies & Risks</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.alerts?.map((alert: string, idx: number) => (
            <div key={idx} className="flex gap-2 bg-rose-50/30 border border-rose-100/40 p-3 rounded-xl items-start">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5 animate-pulse" />
              <span className="text-[11px] font-bold text-rose-900 leading-normal">{alert}</span>
            </div>
          ))}
          {data.alerts?.length === 0 && (
            <div className="col-span-3 text-center py-2 text-xs font-semibold text-emerald-600 bg-emerald-50/20 rounded-xl border border-emerald-100/30">
              ✔ Operations normal: No high-risk anomalies identified in this processing window.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
